import { describe, expect, it } from "vitest";

import {
  createDraftKeeper,
  createMapleClient,
  DRAFT_EXPORT_VERSION,
  readDraftExport,
  writeDraftExport,
} from "../src/client/index.js";

import type { MapleClient } from "../src/client/index.js";
import type { Draft } from "../src/overlay/index.js";

const NOW = Date.parse("2026-09-18T10:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

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

function draft(id: string, body: string, at = NOW): Draft {
  return {
    id,
    body,
    anchor: { selector: "main > section", region: { x: 0.1, y: 0.1, width: 0.3, height: 0.1 } },
    context: {
      url: "https://brew-preview.example.test/roasts/huila",
      viewportWidth: 1200,
      viewportHeight: 800,
      contentWidth: 1185,
      devicePixelRatio: 2,
      colorScheme: "light",
    },
    updatedAt: new Date(at).toISOString(),
  };
}

function client(branch: string, storage = memoryStorage()): MapleClient {
  return createMapleClient({ branch, storage, now: () => NOW, debounceMs: 0 });
}

function keep(maple: MapleClient, body: string, component: string): void {
  maple.openComposer({ kind: "element", anchor: { component } });
  maple.setBody(body);
  maple.keepDraft();
}

describe("reading an export", () => {
  it.each([
    ["not json", "{nope"],
    ["a bare list, which is not an export", "[]"],
    ["no branch", JSON.stringify({ version: 1, drafts: [] })],
    ["no drafts", JSON.stringify({ version: 1, branch: "demo" })],
  ])("refuses %s as unreadable", (_name, text) => {
    expect(readDraftExport(text)).toEqual({ ok: false, reason: "unreadable" });
  });

  it("refuses a version it does not know", () => {
    const text = JSON.stringify({ version: 2, branch: "demo", drafts: [] });

    expect(readDraftExport(text)).toEqual({ ok: false, reason: "unsupported" });
  });

  it("keeps the drafts and counts each entry that is not one", () => {
    const text = JSON.stringify({
      version: DRAFT_EXPORT_VERSION,
      branch: "demo",
      drafts: [draft("d1", "kept"), { id: "d2" }, "nope", { ...draft("d3", "x"), updatedAt: 5 }],
    });

    const read = readDraftExport(text);
    expect(read).toMatchObject({ ok: true, branch: "demo", invalid: 3 });
    expect(read.ok && read.drafts.map((one) => one.id)).toEqual(["d1"]);
  });
});

describe("moving drafts between browsers", () => {
  it("reproduces the same list after an export and an import", () => {
    const from = client("demo");
    keep(from, "The crema looks thin.", "YieldCard");
    keep(from, "This label is wrong.", "MrrCard");

    const to = client("demo");
    const outcome = to.importDrafts(from.draftsAsJson());

    expect(outcome).toEqual({ ok: true, added: 2, skipped: 0, expired: 0, invalid: 0 });
    expect(to.getState().drafts).toEqual(from.getState().drafts);
  });

  it("adds nothing the second time", () => {
    const from = client("demo");
    keep(from, "The crema looks thin.", "YieldCard");
    const file = from.draftsAsJson();

    const to = client("demo");
    to.importDrafts(file);
    const again = to.importDrafts(file);

    expect(again).toMatchObject({ ok: true, added: 0, skipped: 1 });
    expect(to.getState().drafts).toHaveLength(1);
  });

  it("skips an invalid entry and reports it", () => {
    const file = JSON.stringify({
      version: 1,
      branch: "demo",
      drafts: [draft("d1", "kept"), { id: "d2" }],
    });
    const to = client("demo");

    expect(to.importDrafts(file)).toMatchObject({ ok: true, added: 1, invalid: 1 });
  });

  it("keeps the original updatedAt and context", () => {
    const old = draft("d1", "from a teammate", NOW - DAY);
    const to = client("demo");
    to.importDrafts(writeDraftExport("demo", [old]));

    expect(to.getState().drafts).toEqual([old]);
  });

  it("never brings back a draft this branch already sent", () => {
    const storage = memoryStorage();
    const kept = createDraftKeeper({ branch: "demo", storage, now: () => NOW });
    kept.save(draft("d1", "sent already"));
    kept.markSent("d1");

    const result = kept.importDrafts([draft("d1", "sent already"), draft("d2", "new")]);

    expect(result).toMatchObject({ added: 1, skipped: 1 });
    expect(kept.list().map((one) => one.id)).toEqual(["d2"]);
  });

  it("turns away a draft older than one is kept, instead of losing it on reload", () => {
    const kept = createDraftKeeper({ branch: "demo", storage: memoryStorage(), now: () => NOW });

    const result = kept.importDrafts([draft("d1", "ancient", NOW - 8 * DAY)]);

    expect(result).toMatchObject({ added: 0, expired: 1 });
    expect(kept.list()).toEqual([]);
  });

  it("previews without adding, and says when the branch differs", () => {
    const to = client("cold-brew-lab");
    const file = writeDraftExport("espresso-bar", [draft("d1", "x"), draft("d2", "y")]);

    expect(to.previewDraftImport(file)).toEqual({
      ok: true,
      branch: "espresso-bar",
      sameBranch: false,
      count: 2,
      invalid: 0,
    });
    expect(to.getState().drafts).toEqual([]);
    expect(to.previewDraftImport(writeDraftExport("cold-brew-lab", [])).ok).toBe(true);
  });

  it("tells a subscriber, so the island updates without a reload", () => {
    const to = client("demo");
    const seen: number[] = [];
    to.subscribe((state) => seen.push(state.drafts.length));

    to.importDrafts(writeDraftExport("demo", [draft("d1", "x")]));

    expect(seen.at(-1)).toBe(1);
  });
});

describe("drafts saved under another branch on this origin", () => {
  function seeded() {
    const storage = memoryStorage();
    const other = createDraftKeeper({ branch: "espresso-bar", storage, now: () => NOW });
    other.save(draft("d1", "the crema looks thin"));
    other.flush();
    other.save(draft("d2", "the label wraps"));
    other.flush();
    return { storage, maple: client("cold-brew-lab", storage) };
  }

  it("is reported with its branch and how many are live", () => {
    const { maple } = seeded();

    expect(maple.foreignDrafts()).toEqual([{ branch: "espresso-bar", count: 2 }]);
  });

  it("is silent when the only other key holds expired or sent drafts", () => {
    const storage = memoryStorage();
    const other = createDraftKeeper({ branch: "espresso-bar", storage, now: () => NOW });
    other.save(draft("old", "ancient", NOW - 8 * DAY));
    other.save(draft("sent", "posted"));
    other.markSent("sent");

    expect(client("cold-brew-lab", storage).foreignDrafts()).toEqual([]);
  });

  it("does not count this branch's own key", () => {
    const storage = memoryStorage();
    const own = createDraftKeeper({ branch: "cold-brew-lab", storage, now: () => NOW });
    own.save(draft("d1", "here"));
    own.flush();

    expect(client("cold-brew-lab", storage).foreignDrafts()).toEqual([]);
  });

  it("moves only when asked, and leaves nothing behind", () => {
    const { maple } = seeded();
    expect(maple.getState().drafts).toEqual([]);

    const result = maple.moveDrafts("espresso-bar");

    expect(result).toMatchObject({ added: 2, skipped: 0 });
    expect(
      maple
        .getState()
        .drafts.map((one) => one.id)
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(["d1", "d2"]);
    expect(maple.foreignDrafts()).toEqual([]);
  });

  it("stays dismissed until a newer draft appears under that key", () => {
    const { storage, maple } = seeded();
    maple.dismissDrafts("espresso-bar");
    expect(client("cold-brew-lab", storage).foreignDrafts()).toEqual([]);

    const later = createDraftKeeper({
      branch: "espresso-bar",
      storage,
      now: () => NOW + DAY,
    });
    later.save(draft("d3", "a new one", NOW + DAY));
    later.flush();

    expect(client("cold-brew-lab", storage).foreignDrafts()).toEqual([
      { branch: "espresso-bar", count: 3 },
    ]);
  });

  it("finds nothing when storage is unreachable", () => {
    const maple = createMapleClient({ branch: "demo", now: () => NOW });

    expect(maple.foreignDrafts()).toEqual([]);
  });
});
