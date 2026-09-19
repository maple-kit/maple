import { useMapleClient } from "@maple-kit/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { MapleRoot, SCHEME_ATTRIBUTE } from "../src/index.js";
import { Header, Island, IslandContent, IslandTrigger, Settings } from "../src/island/index.js";
import { offlineFetch } from "./offline.js";

import type { MapleClient } from "@maple-kit/core/client";
import type { ReactElement } from "react";

const BRANCH = "feat/ui-settings";
const ORIGIN = "https://preview.example";

let client: MapleClient;

function Keep(): null {
  client = useMapleClient();
  return null;
}

function tree(): ReactElement {
  return createElement(
    MapleRoot,
    { branch: BRANCH, options: { fetch: offlineFetch(), origin: ORIGIN } },
    createElement(Keep),
    createElement(
      Island,
      { defaultOpen: true },
      createElement(IslandTrigger),
      createElement(IslandContent, null, createElement(Header, null, createElement(Settings))),
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

function container(): HTMLElement {
  const host = document.querySelector<HTMLElement>("[data-maple-overlay]");
  if (!host) throw new Error("no overlay is mounted");
  return host;
}

/** Opens the panel the cog hides, which is where both preferences live. */
async function panel(): Promise<HTMLElement> {
  find<HTMLButtonElement>(".mk-iconbtn").click();
  await vi.waitFor(() => expect(root().querySelector(".mk-settings")).not.toBeNull());
  return find<HTMLElement>(".mk-settings");
}

/**
 * Both surfaces animate in, and a box measured mid-entrance is a box measured
 * through a scale. Anything geometric waits for the animations to finish.
 */
async function settled(): Promise<HTMLElement> {
  const node = await panel();
  const running = [node, find<HTMLElement>(".mk-card")].flatMap((one) => one.getAnimations());
  await Promise.all(running.map((animation) => animation.finished.catch(() => undefined)));
  return node;
}

function segment(word: string): HTMLButtonElement {
  const found = [...root().querySelectorAll<HTMLButtonElement>(".mk-seg-one")].find(
    (one) => one.textContent === word,
  );
  if (!found) throw new Error(`no theme segment reads ${word}`);
  return found;
}

beforeEach(async () => {
  localStorage.clear();
  document.documentElement.setAttribute("data-theme", "light");
  await page.viewport(1100, 760);
  await render(tree());
  await vi.waitFor(() => expect(root().querySelector(".mk-card")).not.toBeNull());
});

afterEach(() => {
  client.destroy();
  document.documentElement.removeAttribute("data-theme");
  for (const overlay of document.querySelectorAll("[data-maple-overlay]")) overlay.remove();
  localStorage.clear();
});

/**
 * A guest matching the wallpaper cannot be seen, so the default is the host's
 * opposite — but which one it is stays the reviewer's call.
 */
describe("the theme switch", () => {
  it("starts on auto, which is the opposite of the host page", async () => {
    await panel();

    expect(segment("Auto").getAttribute("aria-checked")).toBe("true");
    expect(container().getAttribute(SCHEME_ATTRIBUTE)).toBe("dark");
  });

  it("takes the overlay light over a light page when asked", async () => {
    await panel();
    segment("Light").click();

    await vi.waitFor(() => expect(container().getAttribute(SCHEME_ATTRIBUTE)).toBe("light"));
    expect(client.getState().themePreference).toBe("light");
  });

  it("goes back to the host's opposite on auto", async () => {
    await panel();
    segment("Light").click();
    await vi.waitFor(() => expect(container().getAttribute(SCHEME_ATTRIBUTE)).toBe("light"));

    segment("Auto").click();
    await vi.waitFor(() => expect(container().getAttribute(SCHEME_ATTRIBUTE)).toBe("dark"));
  });

  it("records the host's scheme whatever the overlay is drawn in", async () => {
    await panel();
    segment("Dark").click();

    await vi.waitFor(() => expect(client.getState().themePreference).toBe("dark"));
    expect(client.getState().theme.host).toBe("light");
  });

  it("is remembered for this origin, so the next page starts there", async () => {
    await panel();
    segment("Dark").click();
    await vi.waitFor(() => expect(client.getState().themePreference).toBe("dark"));

    expect(localStorage.getItem(`maple:prefs:${ORIGIN}`)).toContain("dark");
  });

  it("offers three, because three states cannot be a switch", async () => {
    await panel();

    expect(root().querySelectorAll(".mk-seg-one")).toHaveLength(3);
  });
});

/** The control is the shape of the thing it sets: a screen with four corners. */
describe("the corner picker", () => {
  function corner(name: string): HTMLButtonElement {
    return find<HTMLButtonElement>(`.mk-corner[data-mk-corner="${name}"]`);
  }

  it("starts on the corner the island is actually in", async () => {
    await panel();

    expect(corner("bottom-right").getAttribute("aria-checked")).toBe("true");
    expect(find(".mk-island").getAttribute("data-mk-corner")).toBe("bottom-right");
  });

  it("moves the island, and says so on the control", async () => {
    await panel();
    corner("top-left").click();

    await vi.waitFor(() =>
      expect(find(".mk-island").getAttribute("data-mk-corner")).toBe("top-left"),
    );
    expect(corner("top-left").getAttribute("aria-checked")).toBe("true");
    expect(client.getState().position).toBe("top-left");
  });

  it("is remembered for this origin, as a drag to the same corner would be", async () => {
    await panel();
    corner("top-right").click();
    await vi.waitFor(() => expect(client.getState().position).toBe("top-right"));

    expect(localStorage.getItem(`maple:prefs:${ORIGIN}`)).toContain("top-right");
  });

  it("offers all four, named for anyone not looking at the square", async () => {
    await panel();
    const labels = [...root().querySelectorAll(".mk-corner")].map((one) =>
      one.getAttribute("aria-label"),
    );

    expect(labels).toEqual(["Top left", "Top right", "Bottom left", "Bottom right"]);
  });
});

/** A panel inset from one edge and not the other reads as a surface that missed. */
describe("the panel itself", () => {
  it("is the card's own width, inset by the same amount on both edges", async () => {
    const box = (await settled()).getBoundingClientRect();
    const card = find<HTMLElement>(".mk-card").getBoundingClientRect();

    // It spans the card's padding box, so each side is inset by the card's own
    // border and by nothing else. The bug this pins was 6px on one side and
    // none on the other, which reads as a surface that missed.
    const left = box.left - card.left;
    const right = card.right - box.right;
    expect(Math.abs(left - right)).toBeLessThan(0.5);
    expect(left).toBeLessThanOrEqual(2);
  });

  it("rounds its bottom corners the way the card rounds its own", async () => {
    const panelStyle = getComputedStyle(await settled());
    const cardStyle = getComputedStyle(find<HTMLElement>(".mk-card"));

    expect(panelStyle.borderBottomLeftRadius).toBe(cardStyle.borderBottomLeftRadius);
    expect(panelStyle.borderBottomRightRadius).toBe(cardStyle.borderBottomRightRadius);
  });
});
