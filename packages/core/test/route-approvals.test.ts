import { describe, expect, it } from "vitest";

import { createMapleHandler } from "../src/route/index.js";
import { memoryGate } from "../src/testing/memory-gate.js";
import { memoryStore } from "../src/testing/memory-store.js";

import type { IdentityConnector, StoreConnector } from "../src/connectors/types.js";
import type { Approval } from "../src/types.js";

const BASE = "https://preview.example.com";
const BRANCH = "feat/spacing";
const HEAD = "1f3c9ab7d2e4f6a8b0c1d2e3f4a5b6c7d8e9f0a1";

const reviewer: IdentityConnector = {
  name: "test-identity",
  resolveUser: (incoming) =>
    Promise.resolve(
      incoming.headers["cookie"] === "session=valid" ? { id: "u_7", name: "Dana" } : null,
    ),
};

function store(): StoreConnector {
  return memoryStore({ heads: { [BRANCH]: HEAD } });
}

function signedIn(method: string, path: string, body?: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: { cookie: "session=valid" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function anonymous(method: string, path: string, body?: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("approving a preview", () => {
  it("records the reviewer and the commit the store named", async () => {
    const handle = createMapleHandler({ store: store(), identity: reviewer });
    const response = await handle(signedIn("POST", "/api/maple/approvals", { branch: BRANCH }));
    const approval = (await response.json()) as Approval;

    expect(response.status).toBe(201);
    expect(approval).toMatchObject({
      branch: BRANCH,
      commit: HEAD,
      author: { id: "u_7", name: "Dana", provenance: "server" },
    });
    expect(Date.parse(approval.at)).not.toBeNaN();
  });

  it("refuses an approval nobody can be named for", async () => {
    const handle = createMapleHandler({ store: store(), identity: reviewer });
    const response = await handle(anonymous("POST", "/api/maple/approvals", { branch: BRANCH }));

    expect(response.status).toBe(401);
  });

  it("takes no commit from the browser, however one is offered", async () => {
    const handle = createMapleHandler({ store: store(), identity: reviewer });
    const response = await handle(
      signedIn("POST", "/api/maple/approvals", { branch: BRANCH, commit: "deadbeef" }),
    );

    expect(((await response.json()) as Approval).commit).toBe(HEAD);
  });

  it("refuses rather than guessing when the store cannot name a commit", async () => {
    const handle = createMapleHandler({ store: memoryStore(), identity: reviewer });
    const response = await handle(signedIn("POST", "/api/maple/approvals", { branch: BRANCH }));

    expect(response.status).toBe(409);
  });

  it("keeps the note the reviewer left with it", async () => {
    const handle = createMapleHandler({ store: store(), identity: reviewer });
    const response = await handle(
      signedIn("POST", "/api/maple/approvals", { branch: BRANCH, note: "Checked at 375px." }),
    );

    expect(((await response.json()) as Approval).note).toBe("Checked at 375px.");
  });

  it("lists what it recorded", async () => {
    const handle = createMapleHandler({ store: store(), identity: reviewer });
    await handle(signedIn("POST", "/api/maple/approvals", { branch: BRANCH }));

    const listed = await handle(anonymous("GET", `/api/maple/approvals?branch=${BRANCH}`));
    const body = (await listed.json()) as { approvals: Approval[] };
    expect(body.approvals).toHaveLength(1);
  });

  it("requires a branch rather than listing everything", async () => {
    const handle = createMapleHandler({ store: store(), identity: reviewer });
    expect((await handle(anonymous("GET", "/api/maple/approvals"))).status).toBe(400);
  });

  it("answers 501 where the store keeps no approvals", async () => {
    const handle = createMapleHandler({
      store: memoryStore({ withoutApprovals: true, heads: { [BRANCH]: HEAD } }),
      identity: reviewer,
    });

    const listed = await handle(anonymous("GET", `/api/maple/approvals?branch=${BRANCH}`));
    expect(listed.status).toBe(501);
  });
});

describe("taking an approval back", () => {
  async function approved() {
    const handle = createMapleHandler({ store: store(), identity: reviewer });
    const created = await handle(signedIn("POST", "/api/maple/approvals", { branch: BRANCH }));
    return { handle, approval: (await created.json()) as Approval };
  }

  it("removes this reviewer's own", async () => {
    const { handle, approval } = await approved();
    const gone = await handle(
      signedIn("DELETE", `/api/maple/approvals/${approval.id}?branch=${BRANCH}`),
    );

    expect(gone.status).toBe(200);
    const listed = await handle(anonymous("GET", `/api/maple/approvals?branch=${BRANCH}`));
    expect(((await listed.json()) as { approvals: Approval[] }).approvals).toEqual([]);
  });

  it("will not let one reviewer withdraw another's signature", async () => {
    const somebodyElse: IdentityConnector = {
      name: "test-identity",
      resolveUser: (incoming) =>
        Promise.resolve(
          incoming.headers["cookie"] === "session=valid" ? { id: "u_9", name: "Sam" } : null,
        ),
    };
    const shared = store();
    const mine = createMapleHandler({ store: shared, identity: reviewer });
    const theirs = createMapleHandler({ store: shared, identity: somebodyElse });

    const created = await mine(signedIn("POST", "/api/maple/approvals", { branch: BRANCH }));
    const { id } = (await created.json()) as Approval;

    const attempt = await theirs(signedIn("DELETE", `/api/maple/approvals/${id}?branch=${BRANCH}`));
    expect(attempt.status).toBe(404);
  });

  it("refuses a withdrawal from nobody", async () => {
    const { handle, approval } = await approved();
    const attempt = await handle(
      anonymous("DELETE", `/api/maple/approvals/${approval.id}?branch=${BRANCH}`),
    );
    expect(attempt.status).toBe(401);
  });
});

describe("what the gate hears about it", () => {
  it("publishes a verdict when an approval is recorded", async () => {
    const gate = memoryGate();
    const handle = createMapleHandler({
      store: store(),
      identity: reviewer,
      gate,
      requireApproval: true,
    });

    await handle(signedIn("POST", "/api/maple/approvals", { branch: BRANCH }));

    const verdict = gate.history({ branch: BRANCH, sha: HEAD }).at(-1);
    expect(verdict).toMatchObject({ conclusion: "clear", reason: "no-comments" });
    expect(verdict?.title).toBe("Approved by Dana");
  });

  it("blocks again once the approval is withdrawn", async () => {
    const gate = memoryGate();
    const handle = createMapleHandler({
      store: store(),
      identity: reviewer,
      gate,
      requireApproval: true,
    });

    const created = await handle(signedIn("POST", "/api/maple/approvals", { branch: BRANCH }));
    const { id } = (await created.json()) as Approval;
    await handle(signedIn("DELETE", `/api/maple/approvals/${id}?branch=${BRANCH}`));

    expect(gate.history({ branch: BRANCH, sha: HEAD }).at(-1)).toMatchObject({
      conclusion: "blocked",
      reason: "awaiting-approval",
    });
  });

  it("publishes nothing for a listing, which changed nothing", async () => {
    const gate = memoryGate();
    const handle = createMapleHandler({ store: store(), identity: reviewer, gate });

    await handle(anonymous("GET", `/api/maple/approvals?branch=${BRANCH}`));
    expect(gate.history({ branch: BRANCH, sha: HEAD })).toEqual([]);
  });

  it("publishes nothing when the approval was refused", async () => {
    const gate = memoryGate();
    const handle = createMapleHandler({ store: store(), identity: reviewer, gate });

    await handle(anonymous("POST", "/api/maple/approvals", { branch: BRANCH }));
    expect(gate.history({ branch: BRANCH, sha: HEAD })).toEqual([]);
  });
});

describe("what /me says about approval", () => {
  it("says the gate wants one when the route was told to require it", async () => {
    const handle = createMapleHandler({ store: store(), requireApproval: true });
    const body = (await (await handle(anonymous("GET", "/api/maple/me"))).json()) as {
      approval: { required: boolean };
    };
    expect(body.approval).toEqual({ required: true });
  });

  it("does not resolve a store to answer it", async () => {
    const handle = createMapleHandler({
      store: () => {
        throw new Error("the identity route must not need a store");
      },
      requireApproval: true,
    });
    expect((await handle(anonymous("GET", "/api/maple/me"))).status).toBe(200);
  });
});
