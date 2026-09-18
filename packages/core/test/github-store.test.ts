import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { githubStore } from "../src/connectors/github.js";
import { parseFence } from "../src/export/markdown.js";
import { sampleComment } from "../src/testing/fixtures.js";
import { createGitHubFake, pullFor } from "./msw/github.js";
import { createTestServer, useTestServer } from "./msw/server.js";

import type { Comment, CommentStatus } from "../src/types.js";

const API = "https://api.github.com";
const github = createGitHubFake();
const server = createTestServer(...github.handlers);

useTestServer(server, { beforeAll, afterEach, afterAll });

function store() {
  return githubStore({ owner: "maple-kit", repo: "app", token: "test-token" });
}

/** `setStatus` is optional on the contract; this connector always has it. */
function setStatus(id: string, status: CommentStatus): Promise<Comment> {
  const connector = store();
  return connector.setStatus!(id, status);
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

  it("writes the id it assigned back into the fence", async () => {
    const branch = "feature/id";
    const stored = await store().append(sampleComment({ branch }));

    const [posted] = github.commentsOn(pullFor(branch));
    expect(stored.id).toMatch(/^gh_\d+_\d+$/);
    expect(parseFence(posted!.body)?.comments[0]?.id).toBe(stored.id);
  });

  it("uses one issue comment per comment, so GitHub's own threading works", async () => {
    const branch = "feature/many";
    await store().append(sampleComment({ branch, body: "first" }));
    await store().append(sampleComment({ branch, body: "second" }));

    expect(github.commentsOn(pullFor(branch))).toHaveLength(2);
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

  it("rejects an id that is not one of its own", async () => {
    await expect(setStatus("mem_1", "resolved")).rejects.toThrow(/not a github comment id/i);
  });

  it("rejects an id for a comment that is gone", async () => {
    await expect(setStatus("gh_1_999999", "resolved")).rejects.toThrow(/404/);
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
