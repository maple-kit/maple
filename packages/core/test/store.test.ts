import { describe, expect, it, vi } from "vitest";

import { MissingCapabilityError } from "../src/connectors/capabilities.js";
import { MapleStoreError } from "../src/errors.js";
import { createCommentStore } from "../src/store.js";
import { sampleComment } from "../src/testing/fixtures.js";
import { memoryStore } from "../src/testing/memory-store.js";

import type { CommentPage, StoreConnector } from "../src/connectors/types.js";

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
