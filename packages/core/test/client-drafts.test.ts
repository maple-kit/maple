import { afterEach, describe, expect, it, vi } from "vitest";

import { createDraftKeeper, DRAFT_DEBOUNCE_MS, draftIdFor } from "../src/client/index.js";

import type { DraftKeeperOptions } from "../src/client/index.js";
import type { Draft } from "../src/overlay/index.js";

const ANCHOR = { component: "YieldCard", selector: "main > section:nth-child(2)" };
const WEEK = 7 * 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-18T10:00:00.000Z");

function memoryStorage(): Storage {
  const held = new Map<string, string>();
  return {
    get length() {
      return held.size;
    },
    clear: () => held.clear(),
    getItem: (key: string) => held.get(key) ?? null,
    key: (index: number) => [...held.keys()][index] ?? null,
    removeItem: (key: string) => {
      held.delete(key);
    },
    setItem: (key: string, value: string) => {
      held.set(key, value);
    },
  };
}

function keeper(overrides: Partial<DraftKeeperOptions> = {}) {
  return createDraftKeeper({ branch: "feat/x", now: () => NOW, ...overrides });
}

function draft(id: string, body: string, at = NOW): Draft {
  return { id, body, anchor: ANCHOR, updatedAt: new Date(at).toISOString() };
}

afterEach(() => vi.useRealTimers());

describe("when a keystroke reaches storage", () => {
  it("waits out the debounce rather than serialising every character", () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    keeper({ storage }).save(draft("d_1", "spacing"));

    expect(storage).toHaveLength(0);
    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
    expect(storage).toHaveLength(1);
  });

  it("shows the pending draft before it has been written", () => {
    vi.useFakeTimers();
    const kept = keeper({ storage: memoryStorage() });
    kept.save(draft("d_1", "spacing"));

    expect(kept.list().map((entry) => entry.body)).toEqual(["spacing"]);
  });

  it("writes immediately when something is about to take the page away", () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const kept = keeper({ storage });
    kept.save(draft("d_1", "spacing"));
    kept.flush();

    expect(keeper({ storage }).list()).toEqual([draft("d_1", "spacing")]);
  });
});

describe("what a keeper opens with", () => {
  it("brings back a draft written before the page reloaded", () => {
    const storage = memoryStorage();
    const first = keeper({ storage });
    first.save(draft("d_1", "spacing"));
    first.flush();

    expect(keeper({ storage }).get("d_1")?.body).toBe("spacing");
  });

  it("drops a draft older than a week, because the preview is gone", () => {
    const storage = memoryStorage();
    const first = keeper({ storage, now: () => NOW - WEEK - 1000 });
    first.save(draft("d_old", "stale", NOW - WEEK - 1000));
    first.flush();

    expect(keeper({ storage }).list()).toEqual([]);
  });

  it("finds the draft already left on an anchor", () => {
    const storage = memoryStorage();
    const kept = keeper({ storage });
    kept.save({ ...draft(draftIdFor(ANCHOR, NOW), "half a thought"), anchor: ANCHOR });

    expect(kept.find(ANCHOR)?.body).toBe("half a thought");
    expect(kept.find({ key: "something-else" })).toBeUndefined();
  });

  it("stays in memory when storage cannot be reached at all", () => {
    const kept = createDraftKeeper({ branch: "feat/x", now: () => NOW });
    kept.save(draft("d_1", "spacing"));

    expect(kept.list()).toHaveLength(1);
  });
});

/** The failure this prevents: a reviewer handed back a comment they posted. */
describe("two tabs on one branch", () => {
  it("never resurrects a draft the other tab already sent", () => {
    const storage = memoryStorage();
    const here = keeper({ storage });
    const there = keeper({ storage });

    here.save(draft("d_1", "spacing"));
    here.flush();
    there.reconcile();
    there.markSent("d_1");

    here.reconcile();
    expect(here.list()).toEqual([]);
  });

  it("drops what this tab was still typing when the other tab sent it", () => {
    const storage = memoryStorage();
    const here = keeper({ storage });
    const there = keeper({ storage });

    here.save(draft("d_1", "spacing"));
    there.markSent("d_1");
    here.reconcile();

    expect(here.list()).toEqual([]);
  });

  it("keeps a draft nobody sent", () => {
    const storage = memoryStorage();
    const here = keeper({ storage });
    here.save(draft("d_1", "spacing"));
    here.flush();

    here.reconcile();
    expect(here.list()).toHaveLength(1);
  });

  it("knows which storage keys are its own", () => {
    const kept = keeper({ storage: memoryStorage() });

    expect(kept.owns("maple:drafts:feat/x")).toBe(true);
    expect(kept.owns("maple:sent:feat/x")).toBe(true);
    expect(kept.owns("maple:drafts:feat/y")).toBe(false);
    expect(kept.owns(null)).toBe(false);
  });
});

describe("throwing a draft away", () => {
  it("forgets it without pretending it was sent", () => {
    const storage = memoryStorage();
    const kept = keeper({ storage });
    kept.save(draft("d_1", "spacing"));
    kept.discard("d_1");

    expect(kept.list()).toEqual([]);
    expect(storage.getItem("maple:sent:feat/x")).toBeNull();
  });

  it("tells a subscriber every time the set changes", () => {
    const kept = keeper({ storage: memoryStorage() });
    const seen = vi.fn();
    const stop = kept.subscribe(seen);

    kept.save(draft("d_1", "a"));
    kept.discard("d_1");
    stop();
    kept.save(draft("d_2", "b"));

    expect(seen).toHaveBeenCalledTimes(2);
  });
});

describe("whether a reload would lose a draft", () => {
  it("is at risk only inside the debounce window", () => {
    vi.useFakeTimers();
    const kept = keeper({ storage: memoryStorage() });
    expect(kept.atRisk()).toBe(false);

    kept.save(draft("d_1", "spacing"));
    expect(kept.atRisk()).toBe(true);

    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
    expect(kept.atRisk()).toBe(false);
  });

  it("announces the write that ends the window", () => {
    vi.useFakeTimers();
    const kept = keeper({ storage: memoryStorage() });
    const listener = vi.fn();
    kept.save(draft("d_1", "spacing"));
    kept.subscribe(listener);

    vi.advanceTimersByTime(DRAFT_DEBOUNCE_MS);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("is at risk for as long as memory is all there is", () => {
    const kept = keeper();
    expect(kept.atRisk()).toBe(false);

    kept.save(draft("d_1", "spacing"));
    kept.flush();
    expect(kept.atRisk()).toBe(true);
  });
});
