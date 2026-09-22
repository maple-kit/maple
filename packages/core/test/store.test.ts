import { describe, expect, it, vi } from "vitest";

import { MissingCapabilityError } from "../src/connectors/capabilities.js";
import { MapleStoreError } from "../src/errors.js";
import { decideGate } from "../src/gate/decide.js";
import { createCommentStore } from "../src/store.js";
import { sampleComment } from "../src/testing/fixtures.js";
import { memoryStore } from "../src/testing/memory-store.js";

import type { CommentPage, ListQuery, StoreConnector } from "../src/connectors/types.js";

/** A connector whose `list` fails `failures` times before succeeding. */
function flakyStore(failures: number, error: Error): StoreConnector & { calls: () => number } {
  let calls = 0;
  return {
    name: "flaky",
    calls: () => calls,
    list(): Promise<CommentPage> {
      calls += 1;
      return calls <= failures ? Promise.reject(error) : Promise.resolve({ comments: [] });
    },
    append: () => Promise.reject(new Error("not used")),
  };
}

describe("createCommentStore", () => {
  it("rejects a connector missing a required method", () => {
    const partial = { name: "partial" } as unknown as StoreConnector;

    expect(() => createCommentStore(partial)).toThrow(MissingCapabilityError);
  });

  it("exposes the connector's name and capabilities", () => {
    const store = createCommentStore(memoryStore({ appendOnly: true }));

    expect(store.name).toBe("memory");
    expect(store.capabilities.setStatus).toBe(false);
  });

  it("appends and lists through the connector", async () => {
    const store = createCommentStore(memoryStore());
    const stored = await store.append(sampleComment({ branch: "main" }));

    const page = await store.list({ branch: "main" });

    expect(page.comments.map((comment) => comment.id)).toEqual([stored.id]);
  });

  it("returns null from setStatus when the connector cannot change status", async () => {
    const store = createCommentStore(memoryStore({ appendOnly: true }));
    await store.append(sampleComment({ branch: "main" }));

    await expect(store.setStatus("mem_1", "resolved")).resolves.toBeNull();
  });

  it("changes status when the connector supports it", async () => {
    const store = createCommentStore(memoryStore());
    const stored = await store.append(sampleComment({ branch: "main" }));

    await expect(store.setStatus(stored.id, "resolved")).resolves.toMatchObject({
      status: "resolved",
    });
  });

  it("retries a transient failure and succeeds", async () => {
    const connector = flakyStore(2, new Error("socket hang up"));
    const store = createCommentStore(connector);

    await expect(store.list({ branch: "main" })).resolves.toEqual({ comments: [] });
    expect(connector.calls()).toBe(3);
  });

  it("gives up after the retry budget and reports it as unavailable", async () => {
    const connector = flakyStore(99, new Error("socket hang up"));
    const store = createCommentStore(connector);

    await expect(store.list({ branch: "main" })).rejects.toThrow(MapleStoreError);
    await expect(store.list({ branch: "main" })).rejects.toMatchObject({ reason: "unavailable" });
  });

  it("does not retry a rejection the backend will repeat", async () => {
    const connector = flakyStore(99, new Error("403 forbidden"));
    const store = createCommentStore(connector);

    await expect(store.list({ branch: "main" })).rejects.toMatchObject({ reason: "rejected" });
    expect(connector.calls()).toBe(1);
  });

  it("carries the original failure as the cause", async () => {
    const cause = new Error("403 forbidden");
    const store = createCommentStore(flakyStore(99, cause));

    await expect(store.list({ branch: "main" })).rejects.toMatchObject({ cause });
  });

  it("does not call setStatus on a connector that lacks it", async () => {
    const connector = memoryStore({ appendOnly: true });
    const spy = vi.spyOn(connector, "list");
    const store = createCommentStore(connector);

    await store.setStatus("mem_1", "resolved");

    expect(spy).not.toHaveBeenCalled();
  });
});

/**
 * The trap: `decideGate` reads absent approvals as neutral and an empty array
 * as "nobody approved", so a store that keeps none would block for ever.
 */
describe("a missing capability is not an empty answer", () => {
  it("resolves approvals to undefined, so the gate stays neutral", async () => {
    const store = createCommentStore(memoryStore({ withoutApprovals: true }));

    const approvals = await store.approvals("main");

    expect(approvals).toBeUndefined();
    expect(
      decideGate([], {
        requireApproval: true,
        commit: "abc1234",
        ...(approvals ? { approvals } : {}),
      }),
    ).toMatchObject({ conclusion: "neutral", reason: "approval-untracked" });
  });

  it("blocks only when the store can keep an approval and nobody left one", async () => {
    const store = createCommentStore(memoryStore());

    const approvals = await store.approvals("main");

    expect(approvals).toEqual([]);
    expect(
      decideGate([], { requireApproval: true, commit: "abc1234", approvals: approvals! }),
    ).toMatchObject({ conclusion: "blocked", reason: "awaiting-approval" });
  });
});

/** A connector whose optional methods are present and counted. */
function countingStore(watch?: StoreConnector["watch"]): StoreConnector & {
  heads: () => number;
  batches: () => number;
} {
  let heads = 0;
  let batches = 0;
  return {
    ...memoryStore({ heads: { main: "abc1234" } }),
    heads: () => heads,
    batches: () => batches,
    head: (branch) => {
      heads += 1;
      return Promise.resolve(branch === "main" ? `sha${String(heads)}` : undefined);
    },
    appendMany: (comments) => {
      batches += 1;
      return Promise.resolve(
        comments.map((comment, n) => ({ ...comment, id: `b${String(n)}`, status: "open" })),
      );
    },
    ...(watch === undefined ? {} : { watch }),
  };
}

describe("the methods the wrapper carries", () => {
  it("asks the connector for the head every time: a push moves it", async () => {
    const connector = countingStore();
    const store = createCommentStore(connector);

    await expect(store.head("main")).resolves.toBe("sha1");
    await expect(store.head("main")).resolves.toBe("sha2");
    expect(connector.heads()).toBe(2);
  });

  it("reports an unnameable head as undefined rather than a guess", async () => {
    const store = createCommentStore(memoryStore());

    expect(store.capabilities.head).toBe(false);
    await expect(store.head("main")).resolves.toBeUndefined();
  });

  it("does not time out a watch: a quiet window is not a failure", async () => {
    vi.useFakeTimers();
    const quiet = vi.fn(
      (_query: ListQuery, signal: AbortSignal) =>
        new Promise<CommentPage>((resolve) => {
          signal.addEventListener("abort", () => {
            resolve({ comments: [] });
          });
        }),
    );
    const store = createCommentStore(countingStore(quiet));
    const controller = new AbortController();

    try {
      const polling = store.watch({ branch: "main" }, controller.signal);
      await vi.advanceTimersByTimeAsync(60_000);
      controller.abort();

      await expect(polling).resolves.toEqual({ comments: [] });
      expect(quiet).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("times out the calls that are not a watch, on the same connector", async () => {
    vi.useFakeTimers();
    const store = createCommentStore({
      name: "hanging",
      list: () => new Promise<CommentPage>(() => undefined),
      append: () => Promise.reject(new Error("not used")),
    });

    try {
      const listing = expect(store.list({ branch: "main" })).rejects.toMatchObject({
        reason: "unavailable",
      });
      await vi.advanceTimersByTimeAsync(60_000);
      await listing;
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a connector that cannot long-poll as undefined", async () => {
    const store = createCommentStore(memoryStore());

    await expect(
      store.watch({ branch: "main" }, new AbortController().signal),
    ).resolves.toBeUndefined();
  });

  it("spends one write when the connector takes a batch", async () => {
    const connector = countingStore();
    const store = createCommentStore(connector);

    const stored = await store.appendMany([
      sampleComment({ branch: "main" }),
      sampleComment({ branch: "main" }),
    ]);

    expect(stored).toHaveLength(2);
    expect(connector.batches()).toBe(1);
  });

  it("falls back to one call each where the connector has no batch", async () => {
    const store = createCommentStore(memoryStore({ withoutBatch: true }));

    const stored = await store.appendMany([
      sampleComment({ branch: "main" }),
      sampleComment({ branch: "main" }),
    ]);

    expect(stored.map((comment) => comment.id)).toEqual(["mem_1", "mem_2"]);
  });

  it("records and withdraws an approval through the connector", async () => {
    const store = createCommentStore(memoryStore());
    const approval = await store.approve({
      branch: "main",
      commit: "abc1234",
      author: { id: "u1", name: "Reviewer", provenance: "server" },
      at: new Date().toISOString(),
    });

    expect(approval).not.toBeNull();
    await expect(store.unapprove(approval!.id)).resolves.toBe(true);
    await expect(store.approvals("main")).resolves.toEqual([]);
  });

  it("refuses neither approve nor unapprove on a store that keeps none", async () => {
    const store = createCommentStore(memoryStore({ withoutApprovals: true }));

    await expect(
      store.approve({
        branch: "main",
        commit: "abc1234",
        author: { id: "u1", name: "Reviewer", provenance: "server" },
        at: new Date().toISOString(),
      }),
    ).resolves.toBeNull();
    await expect(store.unapprove("app_1")).resolves.toBe(false);
  });
});
