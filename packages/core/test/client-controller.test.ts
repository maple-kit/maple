import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createMapleClient } from "../src/client/index.js";
import { storedComment } from "../src/testing/fixtures.js";
import { createMapleFake, MAPLE_BASE } from "./msw/maple.js";
import { createTestServer, useTestServer } from "./msw/server.js";

import type { ComposerTarget, MapleClient, MapleClientOptions } from "../src/client/index.js";
import type { MapleFake } from "./msw/maple.js";

const NOW = Date.parse("2026-09-18T10:00:00.000Z");
const TARGET: ComposerTarget = {
  kind: "element",
  anchor: { component: "YieldCard" },
  label: "the Yield card",
};

const server = createTestServer();
useTestServer(server, { beforeAll, afterEach, afterAll });

let fake: MapleFake;

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

function client(overrides: Partial<MapleClientOptions> = {}): MapleClient {
  return createMapleClient({
    branch: "feat/x",
    basePath: MAPLE_BASE,
    storage: memoryStorage(),
    now: () => NOW,
    debounceMs: 0,
    ...overrides,
  });
}

beforeEach(() => {
  fake = createMapleFake();
  server.use(...fake.handlers);
});

describe("loading a branch", () => {
  it("ends ready, with the comments and the reviewer the route named", async () => {
    fake.seed(storedComment({ id: "c_1" }), storedComment({ id: "c_2", status: "resolved" }));
    const maple = client();
    await maple.load();

    expect(maple.getState().phase).toBe("ready");
    expect(maple.getState().comments).toHaveLength(2);
    expect(maple.getState().user).toMatchObject({ id: "u_7" });
  });

  it("offers the guest flow when the route has no session for this request", async () => {
    server.use(http.get(`${MAPLE_BASE}/me`, () => HttpResponse.json({ user: null })));
    const maple = client();
    await maple.load();

    expect(maple.getState().user).toBeNull();
    expect(maple.getState().phase).toBe("ready");
  });

  it("stays loadable when only the identity call fails", async () => {
    server.use(http.get(`${MAPLE_BASE}/me`, () => HttpResponse.json({}, { status: 500 })));
    const maple = client();
    await maple.load();

    expect(maple.getState().phase).toBe("ready");
    expect(maple.getState().user).toBeNull();
  });

  it("reports a failure in words rather than throwing at the binding", async () => {
    server.use(
      http.get(`${MAPLE_BASE}/comments`, () =>
        HttpResponse.json({ error: "Something went wrong" }, { status: 500 }),
      ),
    );
    const maple = client();
    await maple.load();

    expect(maple.getState().phase).toBe("error");
    expect(maple.getState().error).toEqual({
      kind: "store",
      during: "load",
      status: 500,
      message: "The comment store refused the request, so nothing could be loaded.",
    });
  });

  it("still asks who the reviewer is when the store refuses the list", async () => {
    server.use(
      http.get(`${MAPLE_BASE}/comments`, () => HttpResponse.json({ error: "no" }, { status: 401 })),
      http.get(`${MAPLE_BASE}/me`, () =>
        HttpResponse.json({ user: null, github: { linked: false } }),
      ),
    );
    const maple = client();
    await maple.load();

    expect(maple.getState().error?.kind).toBe("unauthorized");
    expect(maple.getState().github).toEqual({ state: "unlinked" });
  });

  it("takes a failure off the state when it is dismissed", async () => {
    server.use(
      http.get(`${MAPLE_BASE}/comments`, () => HttpResponse.json({ error: "no" }, { status: 500 })),
    );
    const maple = client();
    await maple.load();
    maple.clearError();

    expect(maple.getState().error).toBeNull();
  });

  it("tells every subscriber, and stops telling one that unsubscribed", async () => {
    const maple = client();
    const seen = vi.fn();
    maple.subscribe(seen)();
    const kept = vi.fn();
    maple.subscribe(kept);

    await maple.load();
    expect(seen).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalled();
  });
});

describe("the filters and the count", () => {
  beforeEach(() => {
    fake.seed(
      storedComment({ id: "c_1", status: "open" }),
      storedComment({ id: "c_2", status: "orphaned" }),
      storedComment({ id: "c_3", status: "resolved" }),
    );
  });

  it("counts everything not resolved, unpinned included", async () => {
    const maple = client();
    await maple.load();

    expect(maple.getState().openCount).toBe(2);
  });

  it("hides resolved until the setting is turned on", async () => {
    const maple = client();
    await maple.load();
    expect(maple.getState().visible.map((found) => found.id)).toEqual(["c_1", "c_2"]);

    maple.setShowResolved(true);
    expect(maple.getState().visible).toHaveLength(3);
  });

  it("recomputes what is visible the moment the filter changes", async () => {
    const maple = client();
    await maple.load();
    maple.setFilter("unpinned");

    expect(maple.getState().visible.map((found) => found.id)).toEqual(["c_2"]);
  });
});

describe("arming a pick", () => {
  it("remembers which of the three is armed, and forgets it on disarm", () => {
    const maple = client();
    maple.arm("region");
    expect(maple.getState().pick).toEqual({ armed: true, kind: "region" });

    maple.disarm();
    expect(maple.getState().pick).toEqual({ armed: false });
  });

  it("disarms when a composer opens, so nothing stays armed behind it", () => {
    const maple = client();
    maple.arm("element");
    maple.openComposer(TARGET);

    expect(maple.getState().pick.armed).toBe(false);
  });

  it("remembers the kind armed last across a second controller", () => {
    const storage = memoryStorage();
    client({ storage, origin: "https://preview.example" }).arm("text");

    const stored = JSON.parse(storage.getItem("maple:prefs:https://preview.example") ?? "{}");
    expect(stored).toMatchObject({ lastPick: "text" });
  });

  it("keeps the other preferences when it remembers the kind", () => {
    const storage = memoryStorage();
    const maple = client({ storage, origin: "https://preview.example" });
    maple.setPosition("top-left");
    maple.arm("region");

    const stored = JSON.parse(storage.getItem("maple:prefs:https://preview.example") ?? "{}");
    expect(stored).toMatchObject({ position: "top-left", lastPick: "region" });
  });
});

describe("the composer", () => {
  it("opens clean on a target it has no draft for", () => {
    const maple = client();
    maple.openComposer(TARGET);

    expect(maple.getState().composer).toMatchObject({ open: true, body: "", dirty: false });
    expect(maple.getState().composer.target?.label).toBe("the Yield card");
  });

  it("names the target through the one labelling rule when nobody passed a name", () => {
    const maple = client();
    maple.openComposer({ kind: "element", anchor: { component: "YieldCard" } });

    expect(maple.getState().composer.target?.label).toBe("Yield card");
  });

  it("keeps a label the caller resolved from the element itself", () => {
    const maple = client();
    maple.openComposer(TARGET);

    expect(maple.getState().composer.target?.label).toBe("the Yield card");
  });

  it("becomes dirty on the first keystroke and keeps the draft with it", () => {
    const maple = client();
    maple.openComposer(TARGET);
    maple.setBody("The spacing is off.");

    expect(maple.getState().composer.dirty).toBe(true);
    expect(maple.getState().drafts.map((entry) => entry.body)).toEqual(["The spacing is off."]);
  });

  it("keeps the draft when it is closed, because only a send clears one", () => {
    const maple = client();
    maple.openComposer(TARGET);
    maple.setBody("Half a thought");
    maple.closeComposer();

    expect(maple.getState().composer.open).toBe(false);
    expect(maple.getState().drafts).toHaveLength(1);
  });

  it("comes back to the same draft when the same target is picked again", () => {
    const maple = client();
    maple.openComposer(TARGET);
    maple.setBody("Half a thought");
    maple.closeComposer();
    maple.openComposer(TARGET);

    expect(maple.getState().composer.body).toBe("Half a thought");
    expect(maple.getState().drafts).toHaveLength(1);
  });

  it("resumes a draft the reviewer picked out of the list", () => {
    const maple = client();
    maple.openComposer(TARGET);
    maple.setBody("Half a thought");
    maple.closeComposer();

    const [draft] = maple.getState().drafts;
    maple.resumeDraft(draft!.id);
    expect(maple.getState().composer).toMatchObject({ open: true, body: "Half a thought" });
  });

  it("carries attachments with the draft and lets one be taken off again", () => {
    const maple = client();
    maple.openComposer(TARGET);
    maple.attach({ connector: "github", key: "k_1", contentType: "image/png" });
    maple.attach({ connector: "github", key: "k_2", contentType: "image/png" });
    maple.detach("k_1");

    expect(maple.getState().composer.attachments.map((ref) => ref.key)).toEqual(["k_2"]);
    expect(maple.getState().drafts[0]?.attachments).toHaveLength(1);
  });

  it("throws away a draft when the reviewer discards it", () => {
    const maple = client();
    maple.openComposer(TARGET);
    maple.setBody("Never mind");
    maple.discardDraft();

    expect(maple.getState().drafts).toEqual([]);
    expect(maple.getState().composer.dirty).toBe(false);
  });
});

describe("publishing", () => {
  it("posts what is open, keeps the comment, and clears the draft it came from", async () => {
    const maple = client();
    maple.openComposer(TARGET);
    maple.setBody("The spacing is off.");
    const [comment] = await maple.publish();

    expect(comment?.body).toBe("The spacing is off.");
    expect(maple.getState().comments.map((found) => found.id)).toEqual([comment?.id]);
    expect(maple.getState().drafts).toEqual([]);
    expect(maple.getState().composer).toMatchObject({ open: false, dirty: false });
  });

  it("publishes nothing rather than posting a blank comment", async () => {
    const maple = client();
    maple.openComposer(TARGET);
    maple.setBody("   ");

    expect(await maple.publish()).toEqual([]);
  });

  it("publishes nothing when there is nothing kept", async () => {
    expect(await client().publish()).toEqual([]);
  });

  it("keeps the drafts and says what happened when the route refuses them", async () => {
    server.use(
      http.post(`${MAPLE_BASE}/comments`, () =>
        HttpResponse.json({ error: "The request was not valid for this store" }, { status: 400 }),
      ),
    );
    const maple = client();
    maple.openComposer(TARGET);
    maple.setBody("The spacing is off.");

    await expect(maple.publish()).rejects.toThrow("not valid for this store");
    expect(maple.getState().drafts).toHaveLength(1);
    expect(maple.getState().publishing).toBe(false);
    expect(maple.getState().error).toMatchObject({ during: "send", kind: "store", status: 400 });
  });
});

describe("resolving", () => {
  it("replaces the comment in place with what the route stored", async () => {
    const maple = client();
    maple.openComposer(TARGET);
    maple.setBody("The spacing is off.");
    const [comment] = await maple.publish();

    await maple.setStatus(comment!.id, "resolved", { sha: "abc123", note: "Fixed the gap." });
    expect(maple.getState().comments[0]?.status).toBe("resolved");
    expect(maple.getState().openCount).toBe(0);
  });
});

describe("what a link asked for", () => {
  it("starts on the comment, the corner and the detail the config carries", () => {
    const maple = client({
      config: {
        enabled: true,
        position: "top-left",
        detail: "developer",
        theme: "dark",
        hideResolved: false,
        assist: false,
        shortcut: "c",
        allowUrlOverride: true,
        comment: "c_9",
        pick: "region",
      },
    });

    const state = maple.getState();
    expect(state.position).toBe("top-left");
    expect(state.detail).toBe("developer");
    expect(state.themePreference).toBe("dark");
    expect(state.selected).toBe("c_9");
    expect(state.showResolved).toBe(true);
    expect(state.pick).toEqual({ armed: true, kind: "region" });
  });

  it("hides resolved comments by default, because the filter is one click away", () => {
    expect(client().getState().showResolved).toBe(false);
  });
});

describe("a preference the viewer set", () => {
  it("remembers the corner, the detail and the theme across a second controller", () => {
    const storage = memoryStorage();
    const first = client({ storage, origin: "https://preview.example" });
    first.setPosition("top-right");
    first.setDetail("developer");
    first.setTheme("light");

    const second = client({ storage, origin: "https://preview.example" });
    expect(second.getState().position).toBe("top-right");
    expect(second.getState().detail).toBe("developer");
    expect(second.getState().themePreference).toBe("light");
  });

  it("starts on auto, and takes each of the three when asked", () => {
    const maple = client();
    expect(maple.getState().themePreference).toBe("auto");

    maple.setTheme("dark");
    expect(maple.getState().themePreference).toBe("dark");
    maple.setTheme("auto");
    expect(maple.getState().themePreference).toBe("auto");
  });

  it("stays presentation only: the theme changes no comment", async () => {
    fake.seed(storedComment({ id: "c_2" }));
    const maple = client();
    await maple.load();
    const before = maple.getState().comments;

    maple.setTheme("dark");
    expect(maple.getState().comments).toBe(before);
  });

  it("stays presentation only: the detail changes no comment", async () => {
    fake.seed(storedComment({ id: "c_1" }));
    const maple = client();
    await maple.load();
    const before = maple.getState().comments;

    maple.setDetail("developer");
    expect(maple.getState().comments).toBe(before);
  });
});

describe("hidden, which is not gone", () => {
  it("comes back when a comment arrives", async () => {
    const maple = client();
    maple.setHidden(true);
    maple.openComposer(TARGET);
    expect(maple.getState().hidden).toBe(false);

    maple.setHidden(true);
    maple.setBody("The spacing is off.");
    await maple.publish();
    expect(maple.getState().hidden).toBe(false);
  });

  it("comes back when a link selects a comment", () => {
    const maple = client();
    maple.setHidden(true);
    maple.select("c_9");

    expect(maple.getState().hidden).toBe(false);
    expect(maple.getState().selected).toBe("c_9");
  });

  it("comes back when a pick is armed, so nothing is armed out of sight", () => {
    const maple = client();
    maple.setHidden(true);
    maple.arm("text");

    expect(maple.getState().hidden).toBe(false);
    expect(maple.getState().pick).toEqual({ armed: true, kind: "text" });
  });

  it("stays hidden when a load brings back what was already there", async () => {
    fake.seed(storedComment({ id: "c_1" }));
    const maple = client();
    await maple.load();
    maple.setHidden(true);

    await maple.load();
    expect(maple.getState().hidden).toBe(true);
  });

  it("clearing the selection leaves it where it was", () => {
    const maple = client();
    maple.setHidden(true);
    maple.select(null);

    expect(maple.getState().hidden).toBe(true);
    expect(maple.getState().selected).toBeNull();
  });
});

/**
 * A row cannot carry the context badge or the screenshot, and those are most
 * of what a comment written last week is worth opening.
 */
describe("reading a comment already written", () => {
  it("opens the panel on it, with its body, its target and its context", async () => {
    fake.seed(storedComment({ id: "c_7", body: "The gap under the heading is wrong." }));
    const maple = client();
    await maple.load();

    maple.viewComment("c_7");
    const { composer } = maple.getState();

    expect(composer.open).toBe(true);
    expect(composer.viewing).toBe("c_7");
    expect(composer.body).toBe("The gap under the heading is wrong.");
    expect(composer.target?.anchor).toEqual(maple.getState().comments[0]?.anchor);
    expect(composer.target?.context).toEqual(maple.getState().comments[0]?.context);
  });

  it("selects it too, so the page rings what it is about", async () => {
    fake.seed(storedComment({ id: "c_7" }));
    const maple = client();
    await maple.load();

    maple.viewComment("c_7");

    expect(maple.getState().selected).toBe("c_7");
  });

  it("opens no draft and makes nothing dirty: reading is not writing", async () => {
    fake.seed(storedComment({ id: "c_7" }));
    const maple = client();
    await maple.load();

    maple.viewComment("c_7");

    expect(maple.getState().composer.dirty).toBe(false);
    expect(maple.getState().composer.draftId).toBeUndefined();
    expect(maple.getState().drafts).toHaveLength(0);
  });

  it("does nothing for an id the branch does not have", async () => {
    const maple = client();
    await maple.load();

    maple.viewComment("c_nothing");

    expect(maple.getState().composer.open).toBe(false);
  });

  it("takes the island back off hidden, as anything arriving does", async () => {
    fake.seed(storedComment({ id: "c_7" }));
    const maple = client();
    await maple.load();
    maple.setHidden(true);

    maple.viewComment("c_7");

    expect(maple.getState().hidden).toBe(false);
  });
});

/** Hover and selection draw the same ring; only their lifetimes differ. */
describe("what a pointer is over", () => {
  it("starts at nothing and takes whatever is pointed at", () => {
    const maple = client();
    expect(maple.getState().peeked).toBeNull();

    maple.peek("c_1");
    expect(maple.getState().peeked).toBe("c_1");
  });

  it("clears without disturbing what was selected", () => {
    const maple = client();
    maple.select("c_1");
    maple.peek("c_2");

    maple.peek(null);

    expect(maple.getState().peeked).toBeNull();
    expect(maple.getState().selected).toBe("c_1");
  });
});
