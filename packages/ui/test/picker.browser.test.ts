import { useMapleClient } from "@maple-kit/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { MapleRoot } from "../src/index.js";
import {
  Island,
  IslandContent,
  IslandTrigger,
  NewComment,
  PickButton,
} from "../src/island/index.js";
import { MaplePicker } from "../src/picker/index.js";
import { offlineFetch } from "./offline.js";

import type { MapleClient } from "@maple-kit/core/client";
import type { ReactElement } from "react";

const BRANCH = "feat/ui-picker";

/** The controller the tree built, so a test can read what a pick did to it. */
let client: MapleClient;

/** A named element to pick, at a known place, tagged as the build would tag it. */
function fixture(): HTMLElement {
  const node = document.createElement("div");
  node.className = "fixture";
  node.setAttribute("data-maple-src", "src/YieldCard.tsx:12:3");
  node.setAttribute("data-maple-name", "YieldCard");
  node.textContent = "The yield on this card is doing too much work.";
  node.style.cssText = "position:absolute;left:80px;top:220px;width:320px;height:120px;";
  document.body.append(node);
  return node;
}

function tree(): ReactElement {
  return createElement(
    MapleRoot,
    {
      branch: BRANCH,
      theme: "light",
      options: { fetch: offlineFetch() },
    },
    createElement(Keep),
    createElement(MaplePicker),
    createElement(
      Island,
      null,
      createElement(IslandTrigger),
      createElement(
        IslandContent,
        null,
        createElement(
          NewComment,
          null,
          createElement(PickButton, { kind: "element" }),
          createElement(PickButton, { kind: "text" }),
          createElement(PickButton, { kind: "region" }),
        ),
      ),
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

/**
 * A pointer event at a point, on whatever is topmost there. The listeners are
 * on the document in the capture phase, and `elementAt` skips the overlay.
 */
function pointer(type: string, x: number, y: number): void {
  topAt(x, y).dispatchEvent(
    new PointerEvent(type, {
      clientX: x,
      clientY: y,
      pointerId: 1,
      bubbles: true,
      composed: true,
      cancelable: true,
    }),
  );
}

function clickAt(x: number, y: number): void {
  pointer("pointermove", x, y);
  pointer("pointerdown", x, y);
  pointer("pointerup", x, y);
  topAt(x, y).dispatchEvent(
    new MouseEvent("click", {
      clientX: x,
      clientY: y,
      bubbles: true,
      composed: true,
      cancelable: true,
    }),
  );
}

/**
 * The element a real click would land on, shadow root included: dispatching on
 * the host makes every overlay click look like a click on the page.
 */
function topAt(x: number, y: number): Element {
  const outer = document.elementFromPoint(x, y) ?? document.body;
  if (!outer.matches("[data-maple-overlay]")) return outer;
  return root().elementFromPoint(x, y) ?? outer;
}

function press(key: string): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

/** The middle of a node, which is where a reviewer aims. */
function middle(node: Element): readonly [number, number] {
  const box = node.getBoundingClientRect();
  return [box.x + box.width / 2, box.y + box.height / 2];
}

/** Arms a pick the way the island does, and waits for the session to be up. */
async function arm(kind: "element" | "region" | "text"): Promise<void> {
  client.arm(kind);
  await vi.waitFor(() => expect(client.getState().pick.armed).toBe(true));
}

beforeEach(async () => {
  localStorage.clear();
  document.documentElement.setAttribute("data-theme", "light");
  await page.viewport(1100, 760);
  await render(tree());
  await vi.waitFor(() => expect(document.querySelector("[data-maple-overlay]")).not.toBeNull());
});

afterEach(() => {
  client.destroy();
  document.documentElement.removeAttribute("data-theme");
  for (const node of document.querySelectorAll(".fixture")) node.remove();
  for (const overlay of document.querySelectorAll("[data-maple-overlay]")) overlay.remove();
  document.getSelection()?.removeAllRanges();
});

/** Grabs the controller the root built. Nothing else needs a hook for this. */
function Keep(): null {
  client = useMapleClient();
  return null;
}

/**
 * The gap this part closes: `arm` sets a flag, and until something runs the
 * gesture and opens the composer, the flag is all that happens.
 */
describe("an armed pick", () => {
  it("shows the shield for an element, so a click cannot land on the island", async () => {
    await arm("element");
    await vi.waitFor(() => expect(root().querySelector(".mk-shield")).not.toBeNull());

    expect(getComputedStyle(find(".mk-shield")).pointerEvents).toBe("auto");
  });

  it("shows no shield for a passage, because text under one cannot be selected", async () => {
    await arm("text");
    await vi.waitFor(() => expect(root().querySelector(".mk-pick-bar")).not.toBeNull());

    expect(root().querySelector(".mk-shield")).toBeNull();
  });

  it("names the gesture rather than the mode", async () => {
    await arm("region");
    await vi.waitFor(() => expect(root().querySelector(".mk-pick-bar")).not.toBeNull());

    expect(find(".mk-pick-say").textContent).toBe("Drag a box around the area");
  });

  it("opens the composer on what was clicked, and disarms", async () => {
    const node = fixture();
    await arm("element");
    await vi.waitFor(() => expect(root().querySelector(".mk-shield")).not.toBeNull());

    clickAt(...middle(node));

    await vi.waitFor(() => expect(client.getState().composer.open).toBe(true));
    const target = client.getState().composer.target;
    expect(target?.kind).toBe("element");
    expect(target?.anchor.source).toBe("src/YieldCard.tsx:12:3");
    expect(target?.label).toBe("Yield card");
    expect(client.getState().pick.armed).toBe(false);
  });

  it("records the page's shape at pick time, not at send time", async () => {
    const node = fixture();
    await arm("element");
    await vi.waitFor(() => expect(root().querySelector(".mk-shield")).not.toBeNull());

    clickAt(...middle(node));
    await vi.waitFor(() => expect(client.getState().composer.open).toBe(true));

    expect(client.getState().composer.target?.context?.viewportWidth).toBe(1100);
  });

  it("is called off by Escape, leaving the composer shut", async () => {
    await arm("element");
    await vi.waitFor(() => expect(root().querySelector(".mk-shield")).not.toBeNull());

    press("Escape");

    await vi.waitFor(() => expect(client.getState().pick.armed).toBe(false));
    expect(client.getState().composer.open).toBe(false);
    expect(root().querySelector(".mk-shield")).toBeNull();
  });

  it("cycles the three kinds on c pressed again, without going back to the island", async () => {
    press("c");
    await vi.waitFor(() =>
      expect(client.getState().pick).toEqual({ armed: true, kind: "element" }),
    );

    press("c");
    await vi.waitFor(() => expect(client.getState().pick.kind).toBe("text"));
    press("c");
    await vi.waitFor(() => expect(client.getState().pick.kind).toBe("region"));
    press("c");
    await vi.waitFor(() => expect(client.getState().pick.kind).toBe("element"));
  });

  it("no longer cycles on t, which is a letter a reviewer types", async () => {
    await arm("element");
    press("t");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(client.getState().pick.kind).toBe("element");
  });

  it("starts the next comment on the kind the last one was armed as", async () => {
    await arm("region");
    press("Escape");
    await vi.waitFor(() => expect(client.getState().pick.armed).toBe(false));

    press("c");
    await vi.waitFor(() => expect(client.getState().pick).toEqual({ armed: true, kind: "region" }));
  });

  it("switches kind from the bar as well as from the keyboard", async () => {
    await arm("element");
    await vi.waitFor(() => expect(root().querySelector(".mk-pick-bar")).not.toBeNull());

    const buttons = [...root().querySelectorAll<HTMLButtonElement>(".mk-pick-kind")];
    buttons.find((button) => button.textContent === "region")?.click();

    await vi.waitFor(() => expect(client.getState().pick.kind).toBe("region"));
  });

  it("does not pick the page behind its own bar when the bar is clicked", async () => {
    fixture();
    await arm("element");
    await vi.waitFor(() => expect(root().querySelector(".mk-pick-bar")).not.toBeNull());

    const bar = find<HTMLElement>(".mk-pick-bar");
    const [x, y] = middle(bar);
    clickAt(x, y);

    await vi.waitFor(() => expect(root().querySelector(".mk-pick-bar")).not.toBeNull());
    expect(client.getState().composer.open).toBe(false);
    expect(client.getState().pick.armed).toBe(true);
  });

  it("cancels from the bar, which is the way out for anyone not on a keyboard", async () => {
    await arm("element");
    await vi.waitFor(() => expect(root().querySelector(".mk-pick-stop")).not.toBeNull());

    find<HTMLButtonElement>(".mk-pick-stop").click();

    await vi.waitFor(() => expect(client.getState().pick.armed).toBe(false));
  });
});

/**
 * The inventory gets out of the way when a pick is armed from it, and the
 * picker's own bar speaks instead — but it is still reachable.
 */
describe("the island while a pick is armed", () => {
  it("collapses when a pick is armed from it", async () => {
    find<HTMLButtonElement>(".mk-pill").click();
    await vi.waitFor(() => expect(root().querySelector(".mk-card")).not.toBeNull());

    find<HTMLButtonElement>(".mk-pick").click();

    await vi.waitFor(() => expect(root().querySelector(".mk-card")).toBeNull());
    expect(client.getState().pick.armed).toBe(true);
    expect(root().querySelector(".mk-shield")).not.toBeNull();
  });

  it("can be opened again while the pick is still armed", async () => {
    find<HTMLButtonElement>(".mk-pill").click();
    await vi.waitFor(() => expect(root().querySelector(".mk-card")).not.toBeNull());
    find<HTMLButtonElement>(".mk-pick").click();
    await vi.waitFor(() => expect(root().querySelector(".mk-card")).toBeNull());

    find<HTMLButtonElement>(".mk-pill").click();

    await vi.waitFor(() => expect(root().querySelector(".mk-card")).not.toBeNull());
    expect(client.getState().pick.armed).toBe(true);
  });
});

/**
 * A region is a rectangle over several elements, so what it anchors to is the
 * box that holds the whole of it and the rectangle recorded inside that box.
 */
describe("a region", () => {
  /** A drag inside the fixture, in its own coordinates. */
  async function draw(from: [number, number], to: [number, number]): Promise<void> {
    await arm("region");
    await vi.waitFor(() => expect(root().querySelector(".mk-shield")).not.toBeNull());

    const box = fixture().getBoundingClientRect();
    pointer("pointerdown", box.x + from[0], box.y + from[1]);
    pointer("pointermove", box.x + to[0], box.y + to[1]);
    await vi.waitFor(() => expect(root().querySelector(".mk-band")).not.toBeNull());
    pointer("pointerup", box.x + to[0], box.y + to[1]);
    await vi.waitFor(() => expect(client.getState().composer.open).toBe(true));
  }

  it("draws the band as it is dragged and anchors to the box that holds it", async () => {
    await draw([20, 20], [200, 90]);

    expect(client.getState().composer.target?.kind).toBe("region");
    expect(client.getState().composer.target?.anchor.component).toBe("YieldCard");
    expect(root().querySelector(".mk-band")).toBeNull();
  });

  /** Pixels do not survive a reflow, and a fraction of the box does. */
  it("records the rectangle as fractions of that box, not as pixels", async () => {
    await draw([80, 30], [240, 90]);
    const region = client.getState().composer.target?.anchor.region;

    expect(region).toBeDefined();
    expect(region!.x).toBeCloseTo(80 / 320, 2);
    expect(region!.y).toBeCloseTo(30 / 120, 2);
    expect(region!.width).toBeCloseTo(160 / 320, 2);
    expect(region!.height).toBeCloseTo(60 / 120, 2);
  });

  /**
   * `ComposerTarget.label` is the bare name — "the Yield card". Every surface
   * puts its own words round it, so a phrase stored here came back doubled.
   */
  it("stores the name on the target and leaves the phrase to whoever shows it", async () => {
    await draw([20, 20], [200, 90]);
    const { target } = client.getState().composer;

    expect(target?.label).toBe("Yield card");
    expect(target?.label).not.toContain("an area of");
  });
});
