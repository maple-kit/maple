import { useMapleClient } from "@maple-kit/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { MapleRoot } from "../src/index.js";
import { Filters, Island, IslandContent, IslandTrigger, List } from "../src/island/index.js";
import { BRANCH, COMMENTS, fixtureFetch } from "./fixtures.js";

import type { MapleClient } from "@maple-kit/core/client";
import type { ReactElement } from "react";

let client: MapleClient;

function Keep(): null {
  client = useMapleClient();
  return null;
}

/** The filter row, with a list under it so the row has something to control. */
function tree(): ReactElement {
  return createElement(
    MapleRoot,
    { branch: BRANCH, theme: "light", options: { fetch: fixtureFetch() } },
    createElement(Keep),
    createElement(
      Island,
      { defaultOpen: true },
      createElement(IslandTrigger),
      createElement(IslandContent, null, createElement(Filters), createElement(List)),
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

function tally(name: string): HTMLButtonElement {
  return find<HTMLButtonElement>(`.mk-tally-one[data-tally="${name}"]`);
}

beforeEach(async () => {
  localStorage.clear();
  document.documentElement.setAttribute("data-theme", "light");
  await page.viewport(1100, 760);
  await render(tree());
  await vi.waitFor(() => expect(root().querySelector(".mk-filters")).not.toBeNull());
  await vi.waitFor(() => expect(client.getState().comments).toHaveLength(COMMENTS.length));
});

afterEach(() => {
  client.destroy();
  document.documentElement.removeAttribute("data-theme");
  for (const overlay of document.querySelectorAll("[data-maple-overlay]")) overlay.remove();
});

/**
 * Five pills did not fit the card at any width worth having, and the fifth was
 * always half off its right edge. The row is now one select and four dots.
 */
describe("the filter row", () => {
  it("fits inside the card rather than overflowing it", () => {
    const row = find<HTMLElement>(".mk-filters").getBoundingClientRect();
    const card = find<HTMLElement>(".mk-card").getBoundingClientRect();

    expect(row.right).toBeLessThanOrEqual(card.right + 1);
    expect(row.left).toBeGreaterThanOrEqual(card.left - 1);
  });

  it("keeps every dot inside the row, whatever the counts are", () => {
    const row = find<HTMLElement>(".mk-filters").getBoundingClientRect();

    for (const dot of root().querySelectorAll<HTMLElement>(".mk-tally-one")) {
      expect(dot.getBoundingClientRect().right).toBeLessThanOrEqual(row.right + 1);
    }
  });

  it("offers every filter in one select, each with its count", () => {
    const options = [...find<HTMLSelectElement>(".mk-filter-pick").options].map((one) => one.value);

    expect(options).toEqual(["all", "open", "needs_reverify", "resolved", "unpinned"]);
    expect(find<HTMLSelectElement>(".mk-filter-pick").value).toBe("all");
  });

  it("narrows the list from the select", async () => {
    const select = find<HTMLSelectElement>(".mk-filter-pick");
    select.value = "resolved";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    await vi.waitFor(() => expect(client.getState().filter).toBe("resolved"));
  });
});

/** The dots carry the marks' colours, so the row doubles as the key to them. */
describe("the tally", () => {
  it("has one dot per status, and no dot for All", () => {
    const names = [...root().querySelectorAll(".mk-tally-one")].map((one) =>
      one.getAttribute("data-tally"),
    );

    expect(names).toEqual(["open", "needs_reverify", "resolved", "unpinned"]);
  });

  it("counts the same comments the select's own options do", () => {
    const open = tally("open").querySelector(".mk-num")?.textContent;
    const option = [...find<HTMLSelectElement>(".mk-filter-pick").options].find(
      (one) => one.value === "open",
    );

    expect(option?.textContent).toContain(String(open));
  });

  it("narrows to a status when its dot is clicked, and back to all on a second", async () => {
    tally("resolved").click();
    await vi.waitFor(() => expect(client.getState().filter).toBe("resolved"));

    tally("resolved").click();
    await vi.waitFor(() => expect(client.getState().filter).toBe("all"));
  });

  it("holds a count of nothing quieter than one with something in it", () => {
    const empty = [...root().querySelectorAll<HTMLElement>(".mk-tally-one")].find(
      (one) => one.dataset["mkZero"] === "true",
    );

    if (empty) expect(Number(getComputedStyle(empty).opacity)).toBeLessThan(1);
    expect(tally("open").dataset["mkZero"]).toBe("false");
  });
});

/**
 * The card hides its overflow, so a tooltip drawn as a child of the row was
 * clipped — and the clipping took the hover off again, which read as a flicker.
 */
describe("a tally's tooltip", () => {
  async function hover(name: string): Promise<HTMLElement> {
    // React synthesises onPointerEnter from pointerover: pointerenter does not
    // bubble, so a delegated listener never sees one.
    tally(name).dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    await vi.waitFor(() => expect(root().querySelector(".mk-tip:popover-open")).not.toBeNull());
    return find<HTMLElement>(".mk-tip");
  }

  it("says what the dot counts and what clicking it does", async () => {
    const tip = await hover("open");

    expect(tip.textContent).toContain("open comments");
    expect(tip.textContent).toContain("click to show only these");
  });

  it("is in the top layer, which is the only way out of the card's overflow", async () => {
    const tip = await hover("open");

    expect(tip.matches(":popover-open")).toBe(true);
    expect(tip.closest(".mk-card")).not.toBeNull();
  });

  it("is drawn whole, with none of its sentence cut off", async () => {
    const tip = await hover("open");
    const box = tip.getBoundingClientRect();

    expect(box.width).toBeGreaterThan(0);
    expect(tip.scrollHeight).toBeLessThanOrEqual(Math.ceil(box.height) + 1);
    expect(tip.scrollWidth).toBeLessThanOrEqual(Math.ceil(box.width) + 1);
  });

  it("stays inside the viewport wherever the chip is", async () => {
    const tip = await hover("unpinned");
    const box = tip.getBoundingClientRect();

    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(window.innerWidth);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(window.innerHeight);
  });

  it("goes when the pointer leaves, with no second hover needed", async () => {
    await hover("open");
    tally("open").dispatchEvent(
      new PointerEvent("pointerout", { bubbles: true, relatedTarget: document.body }),
    );

    await vi.waitFor(() => expect(root().querySelector(".mk-tip:popover-open")).toBeNull());
  });

  it("opens on focus, so it is not a fact only a mouse can read", async () => {
    tally("resolved").focus();

    await vi.waitFor(() => expect(root().querySelector(".mk-tip:popover-open")).not.toBeNull());
  });
});
