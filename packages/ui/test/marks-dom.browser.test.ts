import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { MapleRoot } from "../src/index.js";
import { MapleMarkLayer } from "../src/marks/index.js";
import { offlineFetch } from "./offline.js";

import type { Comment } from "@maple-kit/core";

const BRANCH = "feat/ui-marks-dom";

const CONTEXT = {
  url: "https://example.test/dashboard",
  viewportWidth: 1280,
  viewportHeight: 900,
  contentWidth: 1280,
  devicePixelRatio: 2,
  colorScheme: "light",
} as const;

function comment(id: string): Comment {
  return {
    id,
    branch: BRANCH,
    body: "The number here does not match the export.",
    status: "open",
    createdAt: "2026-01-04T10:00:00.000Z",
    author: { id: "sam", name: "Sam", provenance: "server", colorSlot: 6 },
    anchor: { key: id },
    context: CONTEXT,
  };
}

function root(): ShadowRoot {
  const shadow = document.querySelector<HTMLElement>("[data-maple-overlay]")?.shadowRoot;
  if (!shadow) throw new Error("no overlay is mounted");
  return shadow;
}

function marks(): HTMLElement[] {
  return [...root().querySelectorAll<HTMLElement>(".mk-mark")];
}

async function pinFor(id: string) {
  const one = comment(id);
  await render(
    createElement(
      MapleRoot,
      { branch: BRANCH, options: { fetch: offlineFetch() } },
      createElement(MapleMarkLayer, { comments: [one], visible: [one] }),
    ),
  );
}

function card(key: string, parent: Element = document.body): HTMLElement {
  const node = document.createElement("div");
  node.setAttribute("data-maple-key", key);
  node.style.cssText = "width: 120px; height: 60px; margin: 20px";
  parent.append(node);
  return node;
}

function modal(): HTMLDialogElement {
  const dialog = document.createElement("dialog");
  dialog.className = "fixture";
  document.body.append(dialog);
  return dialog;
}

afterEach(() => {
  for (const node of document.querySelectorAll(".fixture")) node.remove();
  for (const overlay of document.querySelectorAll("[data-maple-overlay]")) overlay.remove();
});

describe("pins whose anchor leaves the page", () => {
  it("turns off, rather than parking at the corner, when the dialog closes", async () => {
    const dialog = modal();
    card("a", dialog);
    dialog.showModal();
    await pinFor("a");
    await vi.waitFor(() => expect(marks()).toHaveLength(1));
    await vi.waitFor(() => expect(marks()[0]?.hasAttribute("data-mk-off")).toBe(false));

    dialog.close();

    await vi.waitFor(() => expect(marks()[0]?.hasAttribute("data-mk-off")).toBe(true));
  });

  it("turns off on the next frame when its anchor is hidden", async () => {
    const node = card("a");
    node.classList.add("fixture");
    await pinFor("a");
    await vi.waitFor(() => expect(marks()).toHaveLength(1));

    node.style.setProperty("display", "none");
    window.dispatchEvent(new Event("resize"));

    await vi.waitFor(() => expect(marks()[0]?.hasAttribute("data-mk-off")).toBe(true));
  });

  it("is dropped once its anchor is removed", async () => {
    const dialog = modal();
    card("a", dialog);
    dialog.showModal();
    await pinFor("a");
    await vi.waitFor(() => expect(marks()).toHaveLength(1));

    dialog.remove();

    await vi.waitFor(() => expect(marks()).toHaveLength(0));
  });
});

describe("pins whose anchor appears later", () => {
  it("is drawn once a dialog that holds it is mounted and opened", async () => {
    await pinFor("a");
    expect(marks()).toHaveLength(0);

    const dialog = modal();
    card("a", dialog);
    dialog.showModal();

    await vi.waitFor(() => expect(marks()).toHaveLength(1));
  });

  it("follows the anchor to a fresh element when the dialog is rebuilt", async () => {
    const first = modal();
    card("a", first);
    first.showModal();
    await pinFor("a");
    await vi.waitFor(() => expect(marks()).toHaveLength(1));

    first.remove();
    const second = modal();
    card("a", second);
    second.showModal();

    await vi.waitFor(() => expect(marks()[0]?.hasAttribute("data-mk-off")).toBe(false));
    expect(marks()).toHaveLength(1);
  });
});

describe("pins on content a scroll area has clipped", () => {
  function scroller(): HTMLElement {
    const area = document.createElement("div");
    area.className = "fixture";
    area.style.cssText =
      "position: absolute; top: 40px; left: 40px; width: 300px; height: 200px; overflow: auto";
    const spacer = document.createElement("div");
    spacer.style.setProperty("height", "260px");
    area.append(spacer);
    document.body.append(area);
    return area;
  }

  it("is off while scrolled out of the area, and back when scrolled into it", async () => {
    const area = scroller();
    card("a", area);
    await pinFor("a");
    await vi.waitFor(() => expect(marks()).toHaveLength(1));
    await vi.waitFor(() => expect(marks()[0]?.hasAttribute("data-mk-off")).toBe(true));

    area.scrollTop = 260;
    await vi.waitFor(() => expect(marks()[0]?.hasAttribute("data-mk-off")).toBe(false));

    area.scrollTop = 0;
    await vi.waitFor(() => expect(marks()[0]?.hasAttribute("data-mk-off")).toBe(true));
  });
});
