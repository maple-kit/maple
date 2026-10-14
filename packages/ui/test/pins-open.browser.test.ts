import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { MapleRoot } from "../src/index.js";
import { Header, Island, IslandContent, IslandTrigger, Settings } from "../src/island/index.js";
import { MapleMarkLayer } from "../src/marks/index.js";
import { offlineFetch } from "./offline.js";

import type { Comment } from "@maple-kit/core";
import type { MapleProps } from "@maple-kit/core/client";

const BRANCH = "feat/pins-only-when-open";
const STORAGE_KEY = "maple:prefs:https://pins.test";

const COMMENT: Comment = {
  id: "c1",
  branch: BRANCH,
  body: "The number here does not match the export.",
  status: "open",
  createdAt: "2026-01-04T10:00:00.000Z",
  author: { id: "sam", name: "Sam", provenance: "server", colorSlot: 6 },
  anchor: { key: "a" },
  context: {
    url: "https://example.test/dashboard",
    viewportWidth: 1280,
    viewportHeight: 900,
    contentWidth: 1280,
    devicePixelRatio: 2,
    colorScheme: "light",
  },
};

function root(): ShadowRoot {
  const shadow = document.querySelector<HTMLElement>("[data-maple-overlay]")?.shadowRoot;
  if (!shadow) throw new Error("no overlay is mounted");
  return shadow;
}

const count = (selector: string): number => root().querySelectorAll(selector).length;

function find<T extends Element>(selector: string): T {
  const found = root().querySelector<T>(selector);
  if (!found) throw new Error(`nothing matched ${selector}`);
  return found;
}

async function mount(props: MapleProps = {}): Promise<void> {
  const anchor = document.createElement("div");
  anchor.className = "fixture";
  anchor.setAttribute("data-maple-key", "a");
  anchor.style.cssText = "width: 120px; height: 60px; margin: 20px";
  document.body.append(anchor);

  const comments = [COMMENT];
  await render(
    createElement(
      MapleRoot,
      { branch: BRANCH, ...props, options: { fetch: offlineFetch(), origin: "https://pins.test" } },
      createElement(MapleMarkLayer, { comments, visible: comments }),
      createElement(
        Island,
        null,
        createElement(IslandTrigger),
        createElement(IslandContent, null, createElement(Header, null, createElement(Settings))),
      ),
    ),
  );
}

beforeEach(() => localStorage.clear());

afterEach(() => {
  for (const node of document.querySelectorAll(".fixture")) node.remove();
  for (const overlay of document.querySelectorAll("[data-maple-overlay]")) overlay.remove();
  history.replaceState(null, "", "/");
  localStorage.clear();
});

describe("pins: open", () => {
  it("draws every mark by default, island shut or not", async () => {
    await mount();
    await vi.waitFor(() => expect(count(".mk-mark")).toBe(1));
  });

  it("draws no mark and no edge indicator while the island is closed", async () => {
    await mount({ pins: "open" });
    await vi.waitFor(() => expect(count(".mk-pill")).toBe(1));

    expect(count(".mk-mark")).toBe(0);
    expect(count(".mk-edge")).toBe(0);
  });

  it("draws the marks once the island opens and removes them when it closes", async () => {
    await mount({ pins: "open" });
    find<HTMLButtonElement>(".mk-pill").click();
    await vi.waitFor(() => expect(count(".mk-mark")).toBe(1));

    find<HTMLButtonElement>(".mk-pill").click();
    await vi.waitFor(() => expect(count(".mk-mark")).toBe(0));
  });

  it("is asked for by the link", async () => {
    history.replaceState(null, "", "/?maple-pins=open");
    await mount();
    await vi.waitFor(() => expect(count(".mk-pill")).toBe(1));

    expect(count(".mk-mark")).toBe(0);
  });

  it("keeps a selected comment's mark, which is what a deep link lands on", async () => {
    history.replaceState(null, "", "/?maple-comment=c1");
    await mount({ pins: "open" });

    await vi.waitFor(() => expect(count(".mk-mark")).toBe(1));
  });

  it("is a switch in the settings, remembered for the viewer", async () => {
    await mount();
    find<HTMLButtonElement>(".mk-pill").click();
    await vi.waitFor(() => expect(count('[aria-label="Settings"]')).toBe(1));
    find<HTMLButtonElement>('[aria-label="Settings"]').click();
    await vi.waitFor(() => expect(count(".mk-settings")).toBe(1));

    const row = [...root().querySelectorAll(".mk-setting")].find((one) =>
      one.textContent?.includes("Pins only when open"),
    );
    row?.querySelector<HTMLButtonElement>("[role=switch]")?.click();

    await vi.waitFor(() =>
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")).toMatchObject({ pins: "open" }),
    );
    expect(count(".mk-mark")).toBe(1);

    find<HTMLButtonElement>(".mk-pill").click();
    await vi.waitFor(() => expect(count(".mk-mark")).toBe(0));
  });
});
