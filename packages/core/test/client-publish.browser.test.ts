import { afterEach, describe, expect, it, vi } from "vitest";

import { createMapleClient } from "../src/client/index.js";

import type { ClientView, ComposerTarget, MapleClient } from "../src/client/index.js";

const BRANCH = "feat/publish";
const TARGET: ComposerTarget = { kind: "element", anchor: { component: "YieldCard" } };

let maple: MapleClient | undefined;
let tick = Date.parse("2026-09-22T10:00:00.000Z");

/** Counts what is attached to `beforeunload`, which is the guard's whole tell. */
function counting(): { view: ClientView; guarded: () => boolean } {
  let attached = 0;
  const view: ClientView = {
    document,
    history: window.history,
    location: { href: location.href, origin: location.origin, assign: () => undefined },
    addEventListener: (type, listener, options) => {
      if (type === "beforeunload") attached += 1;
      window.addEventListener(type, listener, options);
    },
    removeEventListener: (type, listener, options) => {
      if (type === "beforeunload") attached -= 1;
      window.removeEventListener(type, listener, options);
    },
    matchMedia: (query) => window.matchMedia(query),
    getComputedStyle: (element) => window.getComputedStyle(element),
  };

  return { view, guarded: () => attached > 0 };
}

function client(view: ClientView): MapleClient {
  const made = createMapleClient({
    branch: BRANCH,
    debounceMs: 0,
    now: () => (tick += 1000),
    fetch: () =>
      Promise.resolve(
        new Response(JSON.stringify({ comments: [] }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      ),
    view,
  });
  maple = made;
  made.start();
  return made;
}

afterEach(() => {
  maple?.destroy();
  maple = undefined;
  tick = Date.parse("2026-09-22T10:00:00.000Z");
  vi.restoreAllMocks();
});

describe("the tab closing on something nobody else has seen", () => {
  it("is guarded while a comment is being typed, as it always was", () => {
    const page = counting();
    const one = client(page.view);
    expect(page.guarded()).toBe(false);

    one.openComposer(TARGET);
    one.setBody("half a thought");
    expect(page.guarded()).toBe(true);

    one.discardDraft();
    expect(page.guarded()).toBe(false);
  });

  it("stays guarded after the composer closes on a kept comment", () => {
    const page = counting();
    const one = client(page.view);

    one.openComposer(TARGET);
    one.setBody("worth saying");
    one.keepDraft();

    expect(one.getState().composer.open).toBe(false);
    expect(page.guarded()).toBe(true);
  });

  it("lets go once everything kept has been published", async () => {
    const page = counting();
    const one = client(page.view);

    one.openComposer(TARGET);
    one.setBody("worth saying");
    one.keepDraft();
    await one.publish();

    expect(one.getState().drafts).toEqual([]);
    expect(page.guarded()).toBe(false);
  });

  it("lets go when the last kept comment is thrown away instead", () => {
    const page = counting();
    const one = client(page.view);

    one.openComposer(TARGET);
    one.setBody("never mind");
    one.keepDraft();
    one.discardDraft(one.getState().drafts[0]!.id);

    expect(page.guarded()).toBe(false);
  });
});
