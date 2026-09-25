import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { githubStore } from "../src/connectors/github.js";
import { parseFence } from "../src/export/markdown.js";
import { SAMPLE_CONTEXT, sampleComment } from "../src/testing/fixtures.js";
import { createGitHubFake, pullFor } from "./msw/github.js";
import { createTestServer, useTestServer } from "./msw/server.js";

import type { MediaConnector, StoreConnector } from "../src/connectors/types.js";
import type { Comment, CommentResolution, CommentStatus, MediaRef } from "../src/types.js";

const API = "https://api.github.com";
const github = createGitHubFake();
const server = createTestServer(...github.handlers);

useTestServer(server, { beforeAll, afterEach, afterAll });

function store() {
  return githubStore({ owner: "maple-kit", repo: "app", token: "test-token" });
}

/** `setStatus` is optional on the contract; this connector always has it. */
function setStatus(
  id: string,
  status: CommentStatus,
  resolution?: CommentResolution,
): Promise<Comment> {
  const connector = store();
  return connector.setStatus!(id, status, resolution);
}

afterEach(() => github.reset());

describe("a branch with no pull request", () => {
  it("lists nothing rather than failing", async () => {
    expect(await store().list({ branch: "no-pull/x" })).toEqual({ comments: [] });
  });

  it("refuses to append, and says where it would have posted", async () => {
    await expect(store().append(sampleComment({ branch: "no-pull/x" }))).rejects.toThrow(
      /no pull request for branch no-pull\/x/i,
    );
  });
});

describe("what gets written to the pull request", () => {
  it("posts a table a person reads and a fence an agent reads", async () => {
    const branch = "feature/badge";
    await store().append(sampleComment({ branch }));

    const [posted] = github.commentsOn(pullFor(branch));
    expect(posted?.body).toContain("| # | Where | Comment | Viewport |");
    expect(posted?.body).toContain("```maple");
    expect(posted?.body).not.toContain("<!--");
  });

  it("gives back the recipe a comment was written under, identical", async () => {
    const branch = "feature/mocked";
    const mock = {
      version: 1 as const,
      calls: [{ key: "trpc:roast.list", state: "empty" as const }],
      route: "/roasts",
      request: "no roasts yet",
    };
    await store().append(sampleComment({ branch, context: { ...SAMPLE_CONTEXT, mock } }));

    const { comments } = await store().list({ branch });
    expect(comments[0]?.context.mock).toEqual(mock);
    expect(github.commentsOn(pullFor(branch))[0]?.body).toContain("· mocked");
  });

  it("writes the id it assigned back into the fence", async () => {
    const branch = "feature/id";
    const stored = await store().append(sampleComment({ branch }));

    const [posted] = github.commentsOn(pullFor(branch));
    expect(stored.id).toMatch(/^gh_\d+_\d+$/);
    expect(parseFence(posted!.body)?.comments[0]?.id).toBe(stored.id);
  });

  it("keeps one issue comment however many visual comments there are", async () => {
    const branch = "feature/many";
    await store().append(sampleComment({ branch, body: "first" }));
    await store().append(sampleComment({ branch, body: "second" }));
    await store().append(sampleComment({ branch, body: "third" }));

    const on = github.commentsOn(pullFor(branch));
    expect(on).toHaveLength(1);
    expect(parseFence(on[0]!.body)?.comments.map((one) => one.body)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });

  it("reposts at the bottom, because an edit notifies nobody", async () => {
    const branch = "feature/repost";
    await store().append(sampleComment({ branch, body: "first" }));
    const [first] = github.commentsOn(pullFor(branch));

    await store().append(sampleComment({ branch, body: "second" }));
    const [second] = github.commentsOn(pullFor(branch));

    expect(second?.id).not.toBe(first?.id);
    expect(github.writes()).toEqual([
      `POST /issues/${String(pullFor(branch))}/comments`,
      `POST /issues/${String(pullFor(branch))}/comments`,
      `DELETE /issues/comments/${String(first!.id)}`,
    ]);
  });

  it("creates the new comment before deleting the old, so a failure loses nothing", async () => {
    const branch = "feature/order";
    await store().append(sampleComment({ branch, body: "first" }));
    const [first] = github.commentsOn(pullFor(branch));
    await store().append(sampleComment({ branch, body: "second" }));

    const writes = github.writes();
    const posted = writes.lastIndexOf(`POST /issues/${String(pullFor(branch))}/comments`);
    expect(posted).toBeLessThan(writes.indexOf(`DELETE /issues/comments/${String(first!.id)}`));
  });

  it("edits in place on a resolve, which is nobody's news", async () => {
    const branch = "feature/resolve";
    const stored = await store().append(sampleComment({ branch }));
    const [posted] = github.commentsOn(pullFor(branch));

    await setStatus(stored.id, "resolved");

    expect(github.commentsOn(pullFor(branch))[0]?.id).toBe(posted?.id);
    expect(github.writes().at(-1)).toBe(`PATCH /issues/comments/${String(posted!.id)}`);
  });

  it("leaves a comment somebody else wrote exactly where it is", async () => {
    const branch = "feature/theirs";
    const pull = pullFor(branch);
    const theirs = github.post(pull, "Looks good to me, shipping Friday.");

    await store().append(sampleComment({ branch, body: "first" }));
    await store().append(sampleComment({ branch, body: "second" }));

    const on = github.commentsOn(pull);
    expect(on).toHaveLength(2);
    expect(on[0]).toEqual(theirs);
  });

  it("takes the newest ledger and clears the duplicate a failed repost left", async () => {
    const branch = "feature/healing";
    const pull = pullFor(branch);
    await store().append(sampleComment({ branch, body: "first" }));
    const orphaned = github.post(pull, github.commentsOn(pull)[0]!.body);

    expect((await store().list({ branch })).comments.map((one) => one.body)).toEqual(["first"]);

    await store().append(sampleComment({ branch, body: "second" }));
    const on = github.commentsOn(pull);
    expect(on).toHaveLength(1);
    expect(on.map((one) => one.id)).not.toContain(orphaned.id);
  });
});

describe("publishing several at once", () => {
  it("spends one repost on a whole set of drafts", async () => {
    const branch = "feature/batch";
    const connector = store();
    await connector.append(sampleComment({ branch, body: "first" }));

    const stored = await connector.appendMany!([
      sampleComment({ branch, body: "second" }),
      sampleComment({ branch, body: "third" }),
    ]);

    expect(stored.map((one) => one.body)).toEqual(["second", "third"]);
    expect(new Set(stored.map((one) => one.id)).size).toBe(2);

    const on = github.commentsOn(pullFor(branch));
    expect(on).toHaveLength(1);
    expect(parseFence(on[0]!.body)?.comments.map((one) => one.body)).toEqual([
      "first",
      "second",
      "third",
    ]);
    expect(github.writes().filter((one) => one.startsWith("POST"))).toHaveLength(2);
  });

  it("writes nothing at all for an empty set", async () => {
    const branch = "feature/nothing";
    expect(await store().appendMany!([])).toEqual([]);
    expect(github.commentsOn(pullFor(branch))).toEqual([]);
  });
});

describe("approvals on the ledger", () => {
  it("rides in the same comment as the visual comments", async () => {
    const branch = "feature/signed";
    const connector = store();
    await connector.append(sampleComment({ branch, body: "first" }));
    await connector.approve!({
      branch,
      commit: "1f3c9ab",
      author: { id: "u_7", name: "Dana", provenance: "server" },
      at: "2026-09-22T09:00:00.000Z",
    });

    const on = github.commentsOn(pullFor(branch));
    expect(on).toHaveLength(1);
    expect(parseFence(on[0]!.body)?.approvals.map((one) => one.author.name)).toEqual(["Dana"]);
    expect(on[0]!.body).toContain("Approved:");
  });

  it("reposts on an approval and edits in place when one is withdrawn", async () => {
    const branch = "feature/withdrawn";
    const connector = store();
    await connector.append(sampleComment({ branch }));
    const approval = await connector.approve!({
      branch,
      commit: "1f3c9ab",
      author: { id: "u_7", name: "Dana", provenance: "server" },
      at: "2026-09-22T09:00:00.000Z",
    });

    const afterApproval = github.commentsOn(pullFor(branch))[0]!.id;
    await connector.unapprove!(approval.id);

    expect(github.commentsOn(pullFor(branch))[0]?.id).toBe(afterApproval);
    expect(await connector.approvals!(branch)).toEqual([]);
  });

  it("refuses an id that is not one of its own", async () => {
    await expect(store().unapprove!("not-an-id")).rejects.toThrow(/approval id/i);
  });
});

describe("reading a pull request", () => {
  it("ignores an issue comment that is not Maple's", async () => {
    const branch = "feature/mixed";
    const pull = pullFor(branch);
    server.use(
      http.get(`${API}/repos/maple-kit/app/issues/${String(pull)}/comments`, () =>
        HttpResponse.json([
          { id: 1, body: "Looks good to me!" },
          { id: 2, body: '```maple\n{"version":1,"branch":"x","comments":[]}\n```' },
        ]),
      ),
    );

    expect((await store().list({ branch })).comments).toEqual([]);
  });

  it("reports the branch it was asked for, not the one in the fence", async () => {
    const branch = "feature/renamed";
    await store().append(sampleComment({ branch }));

    const [read] = (await store().list({ branch })).comments;
    expect(read?.branch).toBe(branch);
  });

  it("follows GitHub's Link header for the next page", async () => {
    const branch = "feature/paged";
    for (const body of ["one", "two", "three"]) {
      await store().append(sampleComment({ branch, body }));
    }

    const first = await store().list({ branch, limit: 2 });
    expect(first.comments).toHaveLength(2);
    expect(first.cursor).toBe("2");

    const second = await store().list({ branch, limit: 2, cursor: first.cursor! });
    expect(second.comments).toHaveLength(1);
    expect(second.cursor).toBeUndefined();
  });

  it("rejects a cursor that is not a page", async () => {
    await expect(store().list({ branch: "feature/x", cursor: "nonsense" })).rejects.toThrow(
      RangeError,
    );
  });

  it("filters by status without asking GitHub to", async () => {
    const branch = "feature/status";
    const open = await store().append(sampleComment({ branch }));
    await setStatus(open.id, "resolved");

    expect((await store().list({ branch, statuses: ["open"] })).comments).toEqual([]);
    expect((await store().list({ branch, statuses: ["resolved"] })).comments).toHaveLength(1);
  });
});

describe("changing a status", () => {
  it("rewrites the fence in place and the change survives a re-read", async () => {
    const branch = "feature/resolve";
    const stored = await store().append(sampleComment({ branch }));

    const resolved = await setStatus(stored.id, "resolved");
    expect(resolved.status).toBe("resolved");

    const [read] = (await store().list({ branch })).comments;
    expect(read?.status).toBe("resolved");
    expect(github.commentsOn(pullFor(branch))).toHaveLength(1);
  });

  it("writes the resolution into the fence, so a re-read still has the commit", async () => {
    const branch = "feature/resolution";
    const stored = await store().append(sampleComment({ branch }));
    const resolution: CommentResolution = {
      sha: "9f1c0de",
      note: "Matched the card's padding.",
      at: "2026-02-03T09:15:00.000Z",
    };

    expect((await setStatus(stored.id, "resolved", resolution)).resolution).toEqual(resolution);

    const [posted] = github.commentsOn(pullFor(branch));
    expect(parseFence(posted!.body)?.comments[0]?.resolution).toEqual(resolution);

    const [read] = (await store().list({ branch })).comments;
    expect(read?.resolution).toEqual(resolution);
  });

  it("rejects an id that is not one of its own", async () => {
    await expect(setStatus("mem_1", "resolved")).rejects.toThrow(/not a github comment id/i);
  });

  it("rejects an id the ledger does not hold", async () => {
    await expect(setStatus("gh_1_999999", "resolved")).rejects.toThrow(/No Maple record/);
  });
});

describe("when GitHub says no", () => {
  it("carries GitHub's own message rather than inventing one", async () => {
    server.use(
      http.get(`${API}/repos/maple-kit/app/pulls`, () =>
        HttpResponse.json(
          { message: "API rate limit exceeded for installation." },
          { status: 403 },
        ),
      ),
    );

    await expect(store().list({ branch: "feature/x" })).rejects.toThrow(
      /GitHub 403 .*API rate limit exceeded/,
    );
  });

  it("survives an error body that is not JSON", async () => {
    server.use(
      http.get(`${API}/repos/maple-kit/app/pulls`, () =>
        HttpResponse.text("<html>502 Bad Gateway</html>", { status: 502 }),
      ),
    );

    await expect(store().list({ branch: "feature/x" })).rejects.toThrow(/GitHub 502/);
  });
});

describe("the screenshot the table links to", () => {
  const shot: MediaRef = { connector: "bucket", key: "k1", contentType: "image/png" };

  function withMedia(getUrl: MediaConnector["getUrl"]): StoreConnector {
    const media: MediaConnector = {
      name: "bucket",
      putBlob: () => Promise.reject(new Error("not used")),
      getUrl,
    };
    return githubStore({ owner: "maple-kit", repo: "app", token: "test-token", media });
  }

  it("gives the table a Shot column pointing at the hosted image", async () => {
    const branch = "feature/shot";
    const connector = withMedia(() => Promise.resolve("https://cdn.example.com/k1.png"));
    await connector.append(sampleComment({ branch, attachments: [shot] }));

    const [posted] = github.commentsOn(pullFor(branch));
    expect(posted?.body).toContain("| # | Where | Comment | Viewport | Shot |");
    expect(posted?.body).toContain("[view](https://cdn.example.com/k1.png)");
  });

  it("keeps the comment when the media connector cannot answer", async () => {
    const branch = "feature/shot-down";
    const connector = withMedia(() => Promise.reject(new Error("bucket is down")));
    const stored = await connector.append(sampleComment({ branch, attachments: [shot] }));

    const [posted] = github.commentsOn(pullFor(branch));
    expect(posted?.body).not.toContain("Shot");
    expect(parseFence(posted!.body)?.comments[0]?.attachments).toEqual([shot]);
    expect(stored.id).toMatch(/^gh_\d+_\d+$/);
  });

  it("offers no link for a data URL, which GitHub strips anyway", async () => {
    const branch = "feature/shot-data";
    const connector = withMedia(() => Promise.resolve("data:image/png;base64,iVBORw0KGgo="));
    await connector.append(sampleComment({ branch, attachments: [shot] }));

    expect(github.commentsOn(pullFor(branch))[0]?.body).not.toContain("Shot");
  });

  it("ignores an attachment that is not an image", async () => {
    const branch = "feature/shot-pdf";
    const pdf: MediaRef = { connector: "bucket", key: "k2", contentType: "application/pdf" };
    const connector = withMedia(() => Promise.resolve("https://cdn.example.com/k2.pdf"));
    await connector.append(sampleComment({ branch, attachments: [pdf] }));

    expect(github.commentsOn(pullFor(branch))[0]?.body).not.toContain("Shot");
  });

  it("links the shot on a status change too, not only on the first write", async () => {
    const branch = "feature/shot-resolve";
    const connector = withMedia(() => Promise.resolve("https://cdn.example.com/k1.png"));
    const stored = await connector.append(sampleComment({ branch, attachments: [shot] }));
    await connector.setStatus!(stored.id, "resolved");

    expect(github.commentsOn(pullFor(branch))[0]?.body).toContain(
      "[view](https://cdn.example.com/k1.png)",
    );
  });
});
