/**
 * The property the whole gate exists for: a reviewer resolving the last
 * comment clears the check on the same commit, with no new push.
 *
 * `runGateContract` asserts this of a connector. Nothing asserted it of the
 * route, which is where a reviewer actually does it.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { githubGate } from "../src/connectors/github-gate.js";
import { githubStore } from "../src/connectors/github.js";
import { createLogger } from "../src/logger/index.js";
import { memorySink } from "../src/logger/sinks/memory.js";
import { createMapleHandler } from "../src/route/index.js";
import { createCommentStore } from "../src/store.js";
import { sampleComment } from "../src/testing/fixtures.js";
import { memoryGate } from "../src/testing/memory-gate.js";
import { memoryStore } from "../src/testing/memory-store.js";
import { createChecksFake } from "./msw/github-checks.js";
import { createGitHubFake, pullFor } from "./msw/handlers.js";
import { createTestServer, useTestServer } from "./msw/server.js";

import type { GateConnector } from "../src/connectors/types.js";
import type { CommentStore } from "../src/store.js";
import type { MemoryGate } from "../src/testing/memory-gate.js";

const BASE = "https://preview.example.com";
const BRANCH = "feat/leaf";
const SHA = "f00dcafef00dcafef00dcafef00dcafef00dcafe";

function patch(id: string, body: unknown): Request {
  return new Request(`${BASE}/api/maple/comments/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

async function withOpen(
  count: number,
  heads: Readonly<Record<string, string>> = { [BRANCH]: SHA },
): Promise<CommentStore> {
  const store = createCommentStore(memoryStore({ heads }));
  for (let index = 0; index < count; index += 1) {
    await store.append(sampleComment({ branch: BRANCH, body: `comment ${String(index)}` }));
  }
  return store;
}

describe("resolving through the route", () => {
  let gate: MemoryGate;

  beforeEach(() => {
    gate = memoryGate();
  });

  it("clears the check on the same commit when the last comment is resolved", async () => {
    const store = await withOpen(1);
    const handle = createMapleHandler({ store, gate });

    const response = await handle(patch("mem_1", { status: "resolved" }));
    expect(response.status).toBe(200);

    const verdicts = gate.history({ branch: BRANCH, sha: SHA });
    expect(verdicts.at(-1)?.conclusion).toBe("clear");
    expect(verdicts.at(-1)?.reason).toBe("all-resolved");
  });

  it("keeps holding while another comment is open", async () => {
    const store = await withOpen(2);
    const handle = createMapleHandler({ store, gate });

    await handle(patch("mem_1", { status: "resolved" }));

    const verdict = gate.history({ branch: BRANCH, sha: SHA }).at(-1);
    expect(verdict?.conclusion).toBe("blocked");
    expect(verdict?.open).toBe(1);
    expect(verdict?.total).toBe(2);
  });

  it("blocks again when a resolved comment is reopened, with no new commit", async () => {
    const store = await withOpen(1);
    const handle = createMapleHandler({ store, gate });

    await handle(patch("mem_1", { status: "resolved" }));
    await handle(patch("mem_1", { status: "open" }));

    const verdicts = gate.history({ branch: BRANCH, sha: SHA });
    expect(verdicts.map((verdict) => verdict.conclusion)).toEqual(["clear", "blocked"]);
  });

  it("publishes against the commit the store names, never one the client sent", async () => {
    const store = await withOpen(1);
    const handle = createMapleHandler({ store, gate });

    // A browser may claim any sha it likes in a resolution; the gate App can
    // write a check run on any of them, so the claim must not choose the target.
    const claimed = "0000000000000000000000000000000000000000";
    await handle(patch("mem_1", { status: "resolved", resolution: { sha: claimed } }));

    expect(gate.history({ branch: BRANCH, sha: claimed })).toHaveLength(0);
    expect(gate.history({ branch: BRANCH, sha: SHA })).toHaveLength(1);
  });

  it("counts every page, not just the first", async () => {
    const store = await withOpen(150);
    const handle = createMapleHandler({ store, gate });

    await handle(patch("mem_1", { status: "resolved" }));

    expect(gate.history({ branch: BRANCH, sha: SHA }).at(-1)?.total).toBe(150);
  });

  /**
   * A store that keeps no approvals leaves the gate neutral. `[]` would read as
   * "nobody approved" and block for ever on the store that cannot record one.
   */
  it("stays neutral when the store keeps no approvals, rather than blocking", async () => {
    const store = createCommentStore(
      memoryStore({ withoutApprovals: true, heads: { [BRANCH]: SHA } }),
    );
    await store.append(sampleComment({ branch: BRANCH }));
    const handle = createMapleHandler({ store, gate, requireApproval: true });

    expect((await handle(patch("mem_1", { status: "resolved" }))).status).toBe(200);

    expect(gate.history({ branch: BRANCH, sha: SHA }).at(-1)).toMatchObject({
      conclusion: "neutral",
      reason: "approval-untracked",
    });
  });

  it("blocks when the store keeps approvals and nobody has left one", async () => {
    const store = await withOpen(1);
    const handle = createMapleHandler({ store, gate, requireApproval: true });

    await handle(patch("mem_1", { status: "resolved" }));

    expect(gate.history({ branch: BRANCH, sha: SHA }).at(-1)).toMatchObject({
      conclusion: "blocked",
      reason: "awaiting-approval",
    });
  });

  it("says the gate is untracked when the store cannot record a status", async () => {
    const store = createCommentStore(memoryStore({ appendOnly: true, heads: { [BRANCH]: SHA } }));
    const handle = createMapleHandler({ store, gate });

    expect((await handle(patch("mem_1", { status: "resolved" }))).status).toBe(501);
    expect(gate.history({ branch: BRANCH, sha: SHA })).toHaveLength(0);
  });
});

describe("when the gate cannot be published", () => {
  it("still resolves the comment, and says so in the log", async () => {
    const sink = memorySink();
    const failing: GateConnector = {
      name: "failing",
      publish: () =>
        Promise.reject(new Error("GitHub 403 on /check-runs: Resource not accessible")),
    };

    const store = await withOpen(1);
    const handle = createMapleHandler({
      store,
      gate: failing,
      logger: createLogger({ sinks: [sink] }),
    });

    const response = await handle(patch("mem_1", { status: "resolved" }));

    expect(response.status).toBe(200);
    expect(((await response.json()) as { status: string }).status).toBe("resolved");
    expect(sink.records.some((record) => record.level === "error")).toBe(true);
  });

  it("does not leak the forge's message to the browser", async () => {
    const failing: GateConnector = {
      name: "failing",
      publish: () => Promise.reject(new Error("token ghs_secret expired")),
    };

    const store = await withOpen(1);
    const handle = createMapleHandler({ store, gate: failing });

    const body = await (await handle(patch("mem_1", { status: "resolved" }))).text();
    expect(body).not.toContain("ghs_secret");
  });

  it("publishes nothing when the store cannot name a head commit", async () => {
    const sink = memorySink();
    const gate = memoryGate();
    const store = createCommentStore(memoryStore());
    await store.append(sampleComment({ branch: BRANCH }));

    const handle = createMapleHandler({ store, gate, logger: createLogger({ sinks: [sink] }) });
    const response = await handle(patch("mem_1", { status: "resolved" }));

    expect(response.status).toBe(200);
    expect(gate.history({ branch: BRANCH, sha: SHA })).toHaveLength(0);
    expect(sink.records.some((record) => record.level === "warn")).toBe(true);
  });

  it("publishes nothing when the branch has no open pull request", async () => {
    const gate = memoryGate();
    const store = await withOpen(1, {});
    const handle = createMapleHandler({ store, gate });

    expect((await handle(patch("mem_1", { status: "resolved" }))).status).toBe(200);
    expect(gate.history({ branch: BRANCH, sha: SHA })).toHaveLength(0);
  });
});

describe("choosing the gate", () => {
  it("changes nothing when no gate is configured", async () => {
    const store = await withOpen(1);
    const handle = createMapleHandler({ store });

    expect((await handle(patch("mem_1", { status: "resolved" }))).status).toBe(200);
  });

  it("asks a resolver, with the request, the way a store is asked", async () => {
    const gate = memoryGate();
    const seen: string[] = [];
    const store = await withOpen(1);

    const handle = createMapleHandler({
      store,
      gate: (request) => {
        seen.push(request.headers["cookie"] ?? "");
        return gate;
      },
    });

    await handle(
      new Request(`${BASE}/api/maple/comments/mem_1`, {
        method: "PATCH",
        headers: { cookie: "session=valid" },
        body: JSON.stringify({ status: "resolved" }),
      }),
    );

    expect(seen).toEqual(["session=valid"]);
    expect(gate.history({ branch: BRANCH, sha: SHA })).toHaveLength(1);
  });

  it("publishes nothing when the resolver says this deployment has no gate", async () => {
    const store = await withOpen(1);
    const handle = createMapleHandler({ store, gate: () => null });

    expect((await handle(patch("mem_1", { status: "resolved" }))).status).toBe(200);
  });
});

describe("against GitHub, end to end", () => {
  const github = createGitHubFake();
  const checks = createChecksFake();
  const server = createTestServer(...github.handlers, ...checks.handlers);
  useTestServer(server, { beforeAll, afterEach, afterAll });

  beforeEach(() => {
    github.reset();
    checks.reset();
  });

  function handler(): (request: Request) => Promise<Response> {
    const store = createCommentStore(
      githubStore({ owner: "maple-kit", repo: "app", token: "ghs_store" }),
    );
    const gate = githubGate({ owner: "maple-kit", repo: "app", token: "ghs_gate" });
    return createMapleHandler({ store, gate });
  }

  it("flips a blocked run to clear on the same commit, with no new push", async () => {
    github.commit(SHA, BRANCH);
    github.open(BRANCH);

    const handle = handler();
    const posted = await handle(
      new Request(`${BASE}/api/maple/comments`, {
        method: "POST",
        body: JSON.stringify(sampleComment({ branch: BRANCH, commit: SHA })),
      }),
    );
    const comment = (await posted.json()) as { id: string };

    // The comment holds the gate: in_progress, which blocks exactly as hard as
    // a failure and is the only conclusion a resolve can still get out of.
    await handle(patch(comment.id, { status: "open" }));
    const holding = checks.runsOn(SHA).at(-1);
    expect(holding?.status).toBe("in_progress");

    await handle(patch(comment.id, { status: "resolved" }));

    const cleared = checks.runsOn(SHA).at(-1);
    expect(cleared?.status).toBe("completed");
    expect(cleared?.conclusion).toBe("success");
    expect(cleared?.head_sha).toBe(SHA);
    expect(pullFor(BRANCH)).toBeGreaterThan(0);
  });

  it("points the check at the preview the request came from", async () => {
    github.commit(SHA, BRANCH);
    github.open(BRANCH);

    const handle = handler();
    const posted = await handle(
      new Request(`${BASE}/api/maple/comments`, {
        method: "POST",
        body: JSON.stringify(sampleComment({ branch: BRANCH, commit: SHA })),
      }),
    );
    const comment = (await posted.json()) as { id: string };
    await handle(patch(comment.id, { status: "resolved" }));

    expect(checks.runsOn(SHA).at(-1)?.details_url).toBe(BASE);
  });
});
