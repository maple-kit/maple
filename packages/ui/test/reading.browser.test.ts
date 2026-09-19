import { useMapleClient } from "@maple-kit/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import {
  MapleActions,
  MapleAttachments,
  MapleBody,
  MapleComposer,
  MapleContextBadge,
  MapleTarget,
} from "../src/composer/index.js";
import { MapleRoot } from "../src/index.js";
import {
  Header,
  Island,
  IslandContent,
  IslandTrigger,
  Item,
  List,
  Settings,
} from "../src/island/index.js";
import { BRANCH, COMMENTS, fixtureFetch } from "./fixtures.js";

import type { MapleClient } from "@maple-kit/core/client";
import type { ReactElement } from "react";

let client: MapleClient;

function Keep(): null {
  client = useMapleClient();
  return null;
}

function tree(): ReactElement {
  return createElement(
    MapleRoot,
    { branch: BRANCH, theme: "light", options: { fetch: fixtureFetch() } },
    createElement(Keep),
    createElement(
      Island,
      { defaultOpen: true },
      createElement(IslandTrigger),
      createElement(
        IslandContent,
        null,
        createElement(Header, null, createElement(Settings)),
        createElement(List, { children: (comment) => createElement(Item, { comment }) }),
      ),
    ),
    createElement(
      MapleComposer,
      null,
      createElement(MapleTarget, { key: "t" }),
      createElement(MapleBody, { key: "b" }),
      createElement(MapleContextBadge, { key: "c" }),
      createElement(MapleAttachments, { key: "a" }),
      createElement(MapleActions, { key: "f" }),
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

function press(key: string): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

/** Opens the first row's own panel, the way a reviewer clicking it does. */
async function openFirstRow(): Promise<void> {
  find<HTMLElement>(".mk-row").click();
  await vi.waitFor(() => expect(client.getState().composer.viewing).not.toBeUndefined());
}

beforeEach(async () => {
  localStorage.clear();
  document.documentElement.setAttribute("data-theme", "light");
  await page.viewport(1100, 760);
  await render(tree());
  await vi.waitFor(() => expect(root().querySelector(".mk-row")).not.toBeNull());
  await vi.waitFor(() => expect(client.getState().comments).toHaveLength(COMMENTS.length));
});

afterEach(() => {
  client.destroy();
  document.documentElement.removeAttribute("data-theme");
  for (const overlay of document.querySelectorAll("[data-maple-overlay]")) overlay.remove();
});

/**
 * A row carries who, when and the body. The context badge and the screenshot
 * do not fit in it, and those are most of what a comment is worth opening.
 */
describe("clicking a comment", () => {
  it("opens the panel on it, as a thing to read", async () => {
    await openFirstRow();

    expect(find(".mk-composer").getAttribute("data-mk-open")).toBe("true");
    expect(root().querySelector(".mk-read")?.textContent).toBe(COMMENTS[0]?.body);
  });

  it("shows the context the comment was written in, which the row cannot", async () => {
    await openFirstRow();

    expect(root().querySelectorAll(".mk-ctx dt").length).toBeGreaterThan(0);
  });

  it("offers no field: one body per comment, so there is nothing to type into", async () => {
    await openFirstRow();

    expect(root().querySelector(".mk-composer textarea")).toBeNull();
    expect(root().querySelector(".mk-emoji-open")).toBeNull();
  });

  it("offers Close and Resolve rather than Cancel and Comment", async () => {
    await openFirstRow();
    const words = [...root().querySelectorAll(".mk-composer-foot button")].map(
      (one) => one.textContent,
    );

    expect(words).toContain("Close");
    expect(words).toContain("Resolve");
    expect(words).not.toContain("Comment");
  });

  it("resolves it from there, which is the one change a reader makes", async () => {
    await openFirstRow();
    const id = client.getState().composer.viewing!;

    const resolve = [
      ...root().querySelectorAll<HTMLButtonElement>(".mk-composer-foot button"),
    ].find((one) => one.textContent === "Resolve");
    resolve?.click();

    await vi.waitFor(() =>
      expect(client.getState().comments.find((one) => one.id === id)?.status).toBe("resolved"),
    );
  });

  it("selects it, so the page rings what it is about", async () => {
    await openFirstRow();

    expect(client.getState().selected).toBe(client.getState().composer.viewing);
  });
});

/** Hover points at a comment; a click holds it. Both draw the same ring. */
describe("pointing at a row", () => {
  it("peeks while the pointer is over it and lets go after", async () => {
    const row = find<HTMLElement>(".mk-row");

    row.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    await vi.waitFor(() => expect(client.getState().peeked).not.toBeNull());

    row.dispatchEvent(
      new PointerEvent("pointerout", { bubbles: true, relatedTarget: document.body }),
    );
    await vi.waitFor(() => expect(client.getState().peeked).toBeNull());
  });

  it("does not select anything by hovering: a peek sticks to nothing", async () => {
    find<HTMLElement>(".mk-row").dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    await vi.waitFor(() => expect(client.getState().peeked).not.toBeNull());

    expect(client.getState().selected).toBeNull();
  });
});

/**
 * Newest first. Anything else and a reader with the panel up over the card
 * loses both to one keystroke, or loses the wrong one of the two.
 */
describe("Escape", () => {
  it("shuts the panel first, and leaves the card open behind it", async () => {
    await openFirstRow();

    press("Escape");

    await vi.waitFor(() => expect(client.getState().composer.open).toBe(false));
    expect(root().querySelector(".mk-card")).not.toBeNull();
  });

  it("shuts the settings next, and still leaves the card", async () => {
    find<HTMLButtonElement>(".mk-iconbtn").click();
    await vi.waitFor(() => expect(root().querySelector(".mk-settings")).not.toBeNull());

    press("Escape");

    await vi.waitFor(() => expect(root().querySelector(".mk-settings")).toBeNull());
    expect(root().querySelector(".mk-card")).not.toBeNull();
  });

  it("shuts the card last, once nothing is over it", async () => {
    press("Escape");

    await vi.waitFor(() => expect(root().querySelector(".mk-card")).toBeNull());
  });

  it("takes three presses to get from the panel to a bare pill", async () => {
    find<HTMLButtonElement>(".mk-iconbtn").click();
    await vi.waitFor(() => expect(root().querySelector(".mk-settings")).not.toBeNull());
    await openFirstRow();

    press("Escape");
    await vi.waitFor(() => expect(client.getState().composer.open).toBe(false));
    press("Escape");
    await vi.waitFor(() => expect(root().querySelector(".mk-settings")).toBeNull());
    press("Escape");

    await vi.waitFor(() => expect(root().querySelector(".mk-card")).toBeNull());
  });

  it("works with the focus anywhere, not only inside the overlay", async () => {
    await openFirstRow();
    document.body.focus();

    press("Escape");

    await vi.waitFor(() => expect(client.getState().composer.open).toBe(false));
  });
});

/** "3h ago" is what a row is scanned for; which afternoon is asked a minute later. */
describe("a timestamp", () => {
  it("keeps the exact time in a tooltip rather than in the row", () => {
    const when = find<HTMLElement>(".mk-when");

    expect(when.textContent).toMatch(/ago|now/);
    expect(when.querySelector(".mk-tip")?.textContent).toMatch(/\d/);
  });

  it("waits a second before showing it, because nobody hovered on purpose", async () => {
    const when = find<HTMLElement>(".mk-when");
    when.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));

    await new Promise((done) => setTimeout(done, 200));
    expect(root().querySelector(".mk-tip:popover-open")).toBeNull();

    await vi.waitFor(() => expect(root().querySelector(".mk-tip:popover-open")).not.toBeNull(), {
      timeout: 2500,
    });
  });
});
