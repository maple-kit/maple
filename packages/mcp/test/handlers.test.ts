import { memoryStore, sampleComment } from "@maple-kit/core/testing";
import { describe, expect, it } from "vitest";

import { createToolHandlers } from "../src/handlers.js";

import type { StoreConnector } from "@maple-kit/core";

const BRANCH = "feature/x";

function at(minute: number): string {
  return new Date(Date.UTC(2026, 0, 1, 12, minute)).toISOString();
}

async function seeded(...minutes: number[]): Promise<StoreConnector> {
  const store = memoryStore();
  for (const minute of minutes) {
    await store.append(sampleComment({ branch: BRANCH, createdAt: at(minute) }));
  }
  return store;
}

/** A clock the test moves, so a wait is measured rather than endured. */
function clock(start = 0): { now: () => number; sleep: (ms: number) => Promise<void> } {
  let time = start;
  return {
    now: () => time,
    sleep: (ms) => {
      time += ms;
      return Promise.resolve();
    },
  };
}

describe("list_comments", () => {
  it("returns every page, newest first", async () => {
    const handlers = createToolHandlers({ store: await seeded(1, 3, 2) });
    const comments = await handlers.listComments({ branch: BRANCH });

    expect(comments.map((comment) => comment.createdAt)).toEqual([at(3), at(2), at(1)]);
  });

  it("returns nothing for a branch nobody commented on", async () => {
    const handlers = createToolHandlers({ store: await seeded(1) });
    expect(await handlers.listComments({ branch: "other" })).toEqual([]);
  });
});

describe("wait_for_comments", () => {
  it("drains what is already there before blocking", async () => {
    const handlers = createToolHandlers({ store: await seeded(1, 2), ...clock() });
    const result = await handlers.waitForComments({ branch: BRANCH });

    expect(result.status).toBe("comments");
    expect(result.comments).toHaveLength(2);
  });

  it("returns only what is newer than the cursor", async () => {
    const handlers = createToolHandlers({ store: await seeded(1, 2, 3), ...clock() });
    const result = await handlers.waitForComments({ branch: BRANCH, cursor: at(2) });

    expect(result.comments.map((comment) => comment.createdAt)).toEqual([at(3)]);
    expect(result.cursor).toBe(at(3));
  });

  it("times out as a result, never as an error", async () => {
    const handlers = createToolHandlers({ store: await seeded(1), ...clock() });
    const result = await handlers.waitForComments({ branch: BRANCH, cursor: at(9) });

    expect(result).toEqual({ status: "timeout", cursor: at(9), comments: [] });
  });

  it("holds the poll open for the whole budget before giving up", async () => {
    const timing = clock();
    const handlers = createToolHandlers({
      store: await seeded(1),
      pollIntervalMs: 2000,
      ...timing,
    });

    await handlers.waitForComments({ branch: BRANCH, cursor: at(9), timeoutMs: 10_000 });
    expect(timing.now()).toBeGreaterThanOrEqual(10_000);
  });

  it("clamps a wait longer than any client will allow", async () => {
    const timing = clock();
    const handlers = createToolHandlers({ store: await seeded(1), ...timing });

    await handlers.waitForComments({ branch: BRANCH, cursor: at(9), timeoutMs: 600_000 });
    expect(timing.now()).toBeLessThanOrEqual(55_000);
  });

  it("notices a comment that arrives while it is waiting", async () => {
    const store = await seeded(1);
    const timing = clock();
    let ticks = 0;

    const handlers = createToolHandlers({
      store,
      pollIntervalMs: 1000,
      now: timing.now,
      sleep: async (ms) => {
        await timing.sleep(ms);
        ticks += 1;
        if (ticks === 3) await store.append(sampleComment({ branch: BRANCH, createdAt: at(5) }));
      },
    });

    const result = await handlers.waitForComments({ branch: BRANCH, cursor: at(1) });
    expect(result.status).toBe("comments");
    expect(result.comments[0]?.createdAt).toBe(at(5));
  });
});

describe("resolve_comment", () => {
  it("resolves it", async () => {
    const store = await seeded();
    const stored = await store.append(sampleComment({ branch: BRANCH }));
    const handlers = createToolHandlers({ store });

    const resolved = await handlers.resolveComment({ id: stored.id, sha: "abc1234" });
    expect(resolved.status).toBe("resolved");
  });

  it("says where to go when the store cannot change a status", async () => {
    const handlers = createToolHandlers({ store: memoryStore({ appendOnly: true }) });

    await expect(handlers.resolveComment({ id: "x", sha: "abc" })).rejects.toThrow(
      /cannot change a status/,
    );
  });
});

describe("get_comment_context", () => {
  it("lists the anchor rungs in the order a reader should try them", async () => {
    const store = await seeded();
    const stored = await store.append(
      sampleComment({
        branch: BRANCH,
        anchor: {
          source: "src/App.tsx:4:3",
          component: "App",
          quote: { exact: "Overview" },
          selector: "main > h1",
        },
      }),
    );

    const context = await createToolHandlers({ store }).getCommentContext({
      id: stored.id,
      branch: BRANCH,
    });

    expect(context.anchors).toEqual([
      "source src/App.tsx:4:3",
      "component App",
      'quote "Overview"',
      "selector main > h1",
    ]);
  });

  it("offers no anchor at all for an orphan, rather than a stale one", async () => {
    const store = await seeded();
    const stored = await store.append(
      sampleComment({ branch: BRANCH, status: "orphaned", anchor: { selector: "main > h1" } }),
    );

    const context = await createToolHandlers({ store }).getCommentContext({
      id: stored.id,
      branch: BRANCH,
    });
    expect(context.anchors).toEqual([]);
  });

  it("states the conditions the comment was written under", async () => {
    const store = await seeded();
    const stored = await store.append(sampleComment({ branch: BRANCH }));

    const context = await createToolHandlers({ store }).getCommentContext({
      id: stored.id,
      branch: BRANCH,
    });
    expect(context.conditions).toContain("1440×900");
    expect(context.conditions).toContain("light");
  });

  it("says so when the comment is not there", async () => {
    const handlers = createToolHandlers({ store: await seeded(1) });
    await expect(handlers.getCommentContext({ id: "nope", branch: BRANCH })).rejects.toThrow(
      /No comment nope/,
    );
  });
});
