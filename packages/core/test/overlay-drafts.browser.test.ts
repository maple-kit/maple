import { beforeEach, describe, expect, it } from "vitest";

import { createLogger, memorySink } from "../src/logger/index.js";
import { createDraftStore } from "../src/overlay/index.js";

import type { Draft } from "../src/overlay/index.js";

function draft(id: string, body: string, updatedAt = "2026-09-18T10:00:00.000Z"): Draft {
  return { id, body, anchor: { key: `msg:${id}` }, updatedAt };
}

beforeEach(() => localStorage.clear());

describe("drafts", () => {
  it("keeps a draft across two opens of the same branch", () => {
    createDraftStore({ branch: "feat/x" }).save(draft("1", "spacing is off"));
    expect(createDraftStore({ branch: "feat/x" }).list()).toEqual([draft("1", "spacing is off")]);
  });

  it("does not leak a draft from one branch into another", () => {
    createDraftStore({ branch: "feat/x" }).save(draft("1", "a"));
    expect(createDraftStore({ branch: "feat/y" }).list()).toEqual([]);
  });

  it("replaces a draft saved again under the same id", () => {
    const store = createDraftStore({ branch: "feat/x" });
    store.save(draft("1", "first"));
    store.save(draft("1", "second"));

    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]?.body).toBe("second");
  });

  it("lists the newest first", () => {
    const store = createDraftStore({ branch: "feat/x" });
    store.save(draft("old", "a", "2026-09-01T00:00:00.000Z"));
    store.save(draft("new", "b", "2026-09-18T00:00:00.000Z"));

    expect(store.list().map((entry) => entry.id)).toEqual(["new", "old"]);
  });

  it("removes one and clears all", () => {
    const store = createDraftStore({ branch: "feat/x" });
    store.save(draft("1", "a"));
    store.save(draft("2", "b"));
    store.remove("1");
    expect(store.list().map((entry) => entry.id)).toEqual(["2"]);

    store.clear();
    expect(store.list()).toEqual([]);
  });
});

describe("drafts, when storage misbehaves", () => {
  it("discards unreadable contents rather than throwing", () => {
    localStorage.setItem("maple:drafts:feat/x", "{ not json");
    const sink = memorySink();
    const store = createDraftStore({
      branch: "feat/x",
      logger: createLogger({ sinks: [sink], level: "debug" }),
    });

    expect(store.list()).toEqual([]);
    expect(sink.records.some((record) => record.level === "warn")).toBe(true);
  });

  it("drops entries that are not drafts and keeps the ones that are", () => {
    localStorage.setItem("maple:drafts:feat/x", JSON.stringify([draft("1", "a"), { id: 2 }, null]));
    expect(createDraftStore({ branch: "feat/x" }).list()).toHaveLength(1);
  });

  it("keeps working in memory when writing is refused", () => {
    const sink = memorySink();
    const refusing: Storage = {
      ...localStorage,
      getItem: () => null,
      setItem: () => {
        throw new DOMException("QuotaExceededError");
      },
      removeItem: () => undefined,
      clear: () => undefined,
      key: () => null,
      length: 0,
    };
    const store = createDraftStore({
      branch: "feat/x",
      storage: refusing,
      logger: createLogger({ sinks: [sink], level: "debug" }),
    });

    store.save(draft("1", "a"));
    expect(store.list()).toHaveLength(1);
    expect(sink.records.some((record) => record.level === "warn")).toBe(true);
  });
});
