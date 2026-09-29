import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMapleClient } from "../src/client/index.js";

import type { ClientView, ComposerTarget, MapleClient } from "../src/client/index.js";

const BRANCH = "feat/x";
const NOW = Date.parse("2026-09-18T10:00:00.000Z");
const TARGET: ComposerTarget = { kind: "element", anchor: { component: "YieldCard" } };
const DEBOUNCE = 60;

let maple: MapleClient | undefined;

/** A real window whose `beforeunload` listeners are counted as they come and go. */
function watched(): { view: ClientView; attached: () => number } {
  const held = new Set<EventListenerOrEventListenerObject>();
  const view: ClientView = {
    document,
    history: window.history,
    location: { href: location.href, origin: location.origin, assign: () => undefined },
    addEventListener: (type, listener, options) => {
      if (type === "beforeunload") held.add(listener);
      window.addEventListener(type, listener, options);
    },
    removeEventListener: (type, listener, options) => {
      if (type === "beforeunload") held.delete(listener);
      window.removeEventListener(type, listener, options);
    },
    matchMedia: (query) => window.matchMedia(query),
    getComputedStyle: (element) => window.getComputedStyle(element),
  };
  return { view, attached: () => held.size };
}

function started() {
  const { view, attached } = watched();
  const client = createMapleClient({
    branch: BRANCH,
    now: () => NOW,
    debounceMs: DEBOUNCE,
    view,
  });
  maple = client;
  client.start();
  return { client, attached };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  maple?.destroy();
  maple = undefined;
});

describe("when a reload would lose something", () => {
  it("attaches nothing for a saved draft once the composer is closed", () => {
    const { client, attached } = started();
    client.openComposer(TARGET);
    client.setBody("The spacing is off.");
    client.closeComposer();

    expect(client.getState().drafts).toHaveLength(1);
    expect(attached()).toBe(0);
  });

  it("stays detached at load with drafts already in storage", () => {
    const first = started();
    first.client.openComposer(TARGET);
    first.client.setBody("The spacing is off.");
    first.client.closeComposer();
    first.client.destroy();

    const second = started();
    expect(second.client.getState().drafts).toHaveLength(1);
    expect(second.attached()).toBe(0);
  });

  it("attaches while the reviewer is typing", () => {
    const { client, attached } = started();
    client.openComposer(TARGET);
    client.setBody("The spacing is off.");

    expect(attached()).toBe(1);
  });

  it("detaches when a draft being typed is closed, which writes it", () => {
    const { client, attached } = started();
    client.openComposer(TARGET);
    client.setBody("The spacing is off.");
    expect(attached()).toBe(1);

    client.closeComposer();
    expect(attached()).toBe(0);
    expect(localStorage.getItem(`maple:drafts:${BRANCH}`)).toContain("spacing");
  });
});
