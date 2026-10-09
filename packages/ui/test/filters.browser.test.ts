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
  it("has one dot per status, and no dot for Active", () => {
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

describe("the tally's dots", () => {
  it("name their count for a screen reader and draw no tooltip", () => {
    expect(tally("open").getAttribute("aria-label")).toMatch(/open comments?$/);
    expect(root().querySelector(".mk-tip")).toBeNull();
    expect(root().querySelector("[role=tooltip]")).toBeNull();
  });
});
