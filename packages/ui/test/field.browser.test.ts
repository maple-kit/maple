import { toCommentContext } from "@maple-kit/core/overlay";
import { useMapleClient } from "@maple-kit/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { MapleAttachments, MapleBody, MapleComposer, MapleTarget } from "../src/composer/index.js";
import { MapleRoot } from "../src/index.js";
import { offlineFetch } from "./offline.js";

import type { MapleClient } from "@maple-kit/core/client";
import type { PageContext } from "@maple-kit/core/overlay";
import type { ReactElement } from "react";

const BRANCH = "feat/ui-field";

const PAGE: PageContext = {
  url: "https://preview.example/dashboard",
  viewport: { width: 1440, height: 900, contentWidth: 1020, dpr: 2 },
  scheme: "light",
  locale: "en-GB",
  timeZone: "Europe/Berlin",
  reducedMotion: false,
  regions: [],
  capturedAt: "2026-03-02T10:00:00.000Z",
};

let client: MapleClient;

function Keep(): null {
  client = useMapleClient();
  return null;
}

function tree(): ReactElement {
  return createElement(
    MapleRoot,
    { branch: BRANCH, theme: "light", options: { fetch: offlineFetch(), debounceMs: 0 } },
    createElement(Keep),
    createElement(
      MapleComposer,
      null,
      createElement(MapleTarget, { key: "t" }),
      createElement(MapleBody, { key: "b" }),
      createElement(MapleAttachments, { key: "a" }),
    ),
  );
}

function root(): ShadowRoot {
  const host = document.querySelector<HTMLElement>("[data-maple-overlay]");
  if (!host?.shadowRoot) throw new Error("no overlay is mounted");
  return host.shadowRoot;
}

function find<T extends Element>(selector: string): T {
  const found = root().querySelector<T>(selector);
  if (!found) throw new Error(`nothing matched ${selector}`);
  return found;
}

function field(): HTMLTextAreaElement {
  return find<HTMLTextAreaElement>("textarea.mk-body");
}

/**
 * Types the way React hears it: setting `value` directly is invisible to it,
 * because it tracks what it wrote through the prototype's own setter.
 */
function setValue(node: HTMLTextAreaElement, text: string): void {
  const own = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
  own?.set?.call(node, text);
}

function type(text: string): void {
  const node = field();

  node.focus();
  setValue(node, text);
  node.setSelectionRange(text.length, text.length);
  node.dispatchEvent(new Event("input", { bubbles: true }));
}

function key(name: string): void {
  const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
  field().dispatchEvent(event);
}

async function open(): Promise<void> {
  await render(tree());
  await vi.waitFor(() => expect(root().querySelector(".mk-composer")).not.toBeNull());
  client.openComposer({
    kind: "text",
    anchor: { component: "GateNotice", quote: { exact: "until an agent resolves it" } },
    label: "the gate notice",
    context: toCommentContext(PAGE),
  });
  await vi.waitFor(() => expect(find(".mk-composer").getAttribute("data-mk-open")).toBe("true"));
}

beforeEach(async () => {
  localStorage.clear();
  document.documentElement.setAttribute("data-theme", "light");
  await page.viewport(1100, 760);
});

afterEach(() => {
  client.destroy();
  document.documentElement.removeAttribute("data-theme");
  for (const overlay of document.querySelectorAll("[data-maple-overlay]")) overlay.remove();
});

/** Where it is reached from: the hand is already in the text. */
describe("the emoji control", () => {
  it("sits inside the field rather than in the footer", async () => {
    await open();
    const box = find<HTMLElement>(".mk-emoji-open").getBoundingClientRect();
    const area = field().getBoundingClientRect();

    expect(box.right).toBeLessThanOrEqual(area.right);
    expect(box.bottom).toBeLessThanOrEqual(area.bottom);
    expect(box.left).toBeGreaterThan(area.left + area.width / 2);
  });

  it("writes a glyph into the draft when one is chosen", async () => {
    await open();
    type("ship it");
    find<HTMLButtonElement>(".mk-emoji-open").click();

    await vi.waitFor(() => expect(root().querySelector(".mk-emoji-grid")).not.toBeNull());
    find<HTMLButtonElement>('.mk-emoji-one[aria-label="ship"]').click();

    await vi.waitFor(() => expect(client.getState().composer.body).toBe("ship it 🚀 "));
  });

  it("shuts after one is chosen", async () => {
    await open();
    find<HTMLButtonElement>(".mk-emoji-open").click();
    await vi.waitFor(() => expect(root().querySelector(".mk-emoji-grid")).not.toBeNull());

    find<HTMLButtonElement>(".mk-emoji-one").click();

    await vi.waitFor(() => expect(root().querySelector(".mk-emoji-grid")).toBeNull());
  });
});

/** A colon is how an emoji is reached without leaving the keyboard. */
describe("the colon menu", () => {
  it("opens on a colon and narrows as the word is typed", async () => {
    await open();
    type("looks :");
    await vi.waitFor(() => expect(root().querySelector(".mk-emoji-menu")).not.toBeNull());
    const all = root().querySelectorAll(".mk-emoji-menu .mk-emoji-one").length;

    type("looks :bu");

    await vi.waitFor(() =>
      expect(root().querySelectorAll(".mk-emoji-menu .mk-emoji-one")).toHaveLength(1),
    );
    expect(all).toBeGreaterThan(1);
    expect(find(".mk-emoji-menu .mk-emoji-one").textContent).toBe("🐛");
  });

  it("writes over the shortcode rather than beside it", async () => {
    await open();
    type("found a :bug");
    await vi.waitFor(() => expect(root().querySelector(".mk-emoji-menu")).not.toBeNull());

    key("Enter");

    await vi.waitFor(() => expect(client.getState().composer.body).toBe("found a 🐛 "));
  });

  it("moves through the menu with the arrows", async () => {
    await open();
    type("hmm :");
    await vi.waitFor(() => expect(root().querySelector(".mk-emoji-menu")).not.toBeNull());

    key("ArrowDown");

    await vi.waitFor(() =>
      expect(
        root().querySelectorAll(".mk-emoji-menu .mk-emoji-one")[1]?.getAttribute("aria-selected"),
      ).toBe("true"),
    );
  });

  it("is dismissed by Escape without closing the composer", async () => {
    await open();
    type("hmm :");
    await vi.waitFor(() => expect(root().querySelector(".mk-emoji-menu")).not.toBeNull());

    key("Escape");

    await vi.waitFor(() => expect(root().querySelector(".mk-emoji-menu")).toBeNull());
    expect(client.getState().composer.open).toBe(true);
  });

  it("opens for no colon inside a word, which is most of them", async () => {
    await open();
    type("see https://example.test");

    await new Promise((done) => setTimeout(done, 50));
    expect(root().querySelector(".mk-emoji-menu")).toBeNull();
  });
});

/** A comment on six words has to read those six words back. */
describe("the target line", () => {
  it("quotes the passage a text pick selected", async () => {
    await open();

    expect(find(".mk-target-quote").textContent).toBe("until an agent resolves it");
  });

  it("draws the kind as an icon, with the word left for a screen reader", async () => {
    await open();
    const kind = find(".mk-target-kind");

    expect(kind.textContent).toBe("");
    expect(kind.getAttribute("aria-label")).toBe("passage");
  });
});

/** Dashed, because nobody asked for what is inside it. */
describe("the attachment strip", () => {
  it("is dashed, which is how this surface says provisional", async () => {
    await open();

    expect(getComputedStyle(find(".mk-shots")).borderStyle).toBe("dashed");
  });

  it("asks for a paste or a drop, and offers no control to do it with", async () => {
    await open();
    const strip = find(".mk-shots");

    expect(strip.textContent).toContain("Paste or drop an image");
    expect(strip.querySelector("button")).toBeNull();
    expect(strip.querySelector("input")).toBeNull();
  });
});
