import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { MapleRoot } from "../src/index.js";
import {
  Branch,
  Filters,
  Header,
  Island,
  IslandContent,
  IslandTrigger,
  Item,
  List,
  Logo,
  NewComment,
  PickButton,
  Settings,
} from "../src/island/index.js";
import { BRANCH, COMMENTS, fixtureFetch, PAGE_HTML } from "./fixtures.js";

import type { Comment } from "@maple-kit/core";
import type { ReactElement } from "react";

/** The island's own tree, exactly as the composition documents it. */
function mount(): ReactElement {
  return createElement(
    MapleRoot,
    { branch: BRANCH, theme: "light", options: { fetch: fixtureFetch() } },
    createElement(
      Island,
      null,
      createElement(IslandTrigger),
      createElement(
        IslandContent,
        null,
        createElement(
          Header,
          null,
          createElement(Logo),
          createElement(Branch, { branch: BRANCH }),
          createElement(Settings),
        ),
        createElement(Filters),
        createElement(List, {
          children: (comment: Comment) => createElement(Item, { comment }),
        }),
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

function all(selector: string): Element[] {
  return [...root().querySelectorAll(selector)];
}

/** The filter row is a select, so narrowing the list is choosing an option. */
function filterNamed(name: string): { click: () => void } {
  const select = root().querySelector<HTMLSelectElement>(".mk-filter-pick");
  if (!select) throw new Error("no filter select is mounted");
  return {
    click: () => {
      select.value = name;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    },
  };
}

function switchNamed(label: string): HTMLButtonElement {
  const row = all(".mk-setting").find((one) => one.textContent?.startsWith(label));
  const found = row?.querySelector<HTMLButtonElement>(".mk-switch");
  if (!found) throw new Error(`no setting reads ${label}`);
  return found;
}

/** Waits out whatever the element is animating, so a race is not a finding. */
async function settle(element: HTMLElement): Promise<void> {
  await vi.waitFor(() => expect(element.getAnimations()).not.toHaveLength(0));
  await Promise.all(element.getAnimations().map((one) => one.finished.catch(() => undefined)));
}

/** Opens the island and waits for the rows the fixtures produce. */
async function open(): Promise<HTMLElement> {
  await vi.waitFor(() => expect(find(".mk-pill").textContent).toContain("open"));
  find<HTMLButtonElement>(".mk-pill").click();
  await vi.waitFor(() => expect(all(".mk-row").length).toBeGreaterThan(0));
  return find<HTMLElement>(".mk-card");
}

beforeEach(async () => {
  localStorage.clear();
  document.documentElement.setAttribute("data-theme", "light");
  const page = document.createElement("div");
  page.setAttribute("data-fixture-page", "");
  page.innerHTML = PAGE_HTML;
  document.body.append(page);
  await render(mount());
});

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  for (const node of document.querySelectorAll("[data-maple-overlay], [data-fixture-page]")) {
    node.remove();
  }
});

/** One object on a page at rest, and one number on it. */
describe("the collapsed pill", () => {
  it("reads the open count, which is everything not resolved", async () => {
    await vi.waitFor(() => expect(find(".mk-pill").textContent).toBe("8 open"));
    expect(find(".mk-pill").getAttribute("aria-label")).toBe("Open Maple: 8 open");
  });

  it("counts the unpinned ones, which have no mark on the page at all", async () => {
    const unpinned = COMMENTS.filter((comment) => comment.status === "orphaned");
    await vi.waitFor(() => expect(find(".mk-pill").textContent).toBe("8 open"));
    expect(unpinned).toHaveLength(4);
  });

  it("carries a hit area a thumb can find and tabular numbers", async () => {
    await vi.waitFor(() => expect(find(".mk-pill").textContent).toBe("8 open"));
    const pill = find<HTMLElement>(".mk-pill");
    const hit = getComputedStyle(pill, "::after");

    expect(Number.parseInt(hit.width, 10)).toBeGreaterThanOrEqual(40);
    expect(Number.parseInt(hit.height, 10)).toBeGreaterThanOrEqual(40);
    expect(getComputedStyle(find(".mk-num")).fontVariantNumeric).toContain("tabular-nums");
  });

  it("is the only thing the island shows at rest", async () => {
    await vi.waitFor(() => expect(find(".mk-pill").textContent).toBe("8 open"));
    expect(root().querySelector(".mk-card")).toBeNull();
  });
});

/**
 * The gate for this change: swapping a filter replaces the rows and leaves the
 * card alone. Rebuilding it re-ran the entrance and re-measured the height.
 */
describe("swapping a filter", () => {
  it("does not re-enter the card", async () => {
    const card = await open();
    await settle(card);
    let entered = 0;
    card.addEventListener("animationstart", (event) => {
      if (event.target === card) entered += 1;
    });

    filterNamed("open").click();
    await vi.waitFor(() => expect(all(".mk-row")).toHaveLength(3));

    expect(entered).toBe(0);
    expect(card.getAnimations()).toHaveLength(0);
    expect(find(".mk-card")).toBe(card);
  });

  it("keeps the card's own node through several swaps", async () => {
    const card = await open();

    filterNamed("needs_reverify").click();
    await vi.waitFor(() => expect(all(".mk-row")).toHaveLength(1));
    filterNamed("all").click();
    await vi.waitFor(() => expect(all(".mk-row")).toHaveLength(8));

    expect(find(".mk-card")).toBe(card);
  });
});

describe("resolved comments", () => {
  it("are hidden until someone asks for them", async () => {
    await open();
    expect(all(".mk-row")).toHaveLength(8);
    expect(root().querySelector('[data-status="resolved"]')).toBeNull();
  });

  it("are one click away and always honoured", async () => {
    await open();
    filterNamed("resolved").click();

    await vi.waitFor(() => expect(all(".mk-row")).toHaveLength(1));
    expect(find(".mk-row").getAttribute("data-status")).toBe("resolved");
  });
});

describe("the unpinned tab", () => {
  it("lists the four by reason, each with its two words", async () => {
    await open();
    filterNamed("unpinned").click();

    await vi.waitFor(() => expect(all(".mk-row")).toHaveLength(4));
    const labels = all(".mk-row .mk-meta .mk-chip-lost").map(
      (chip) => chip.childNodes[0]?.textContent,
    );
    expect(labels).toEqual(["Nothing matches", "Text changed", "Several matches", "No anchor"]);
  });

  it("keeps the sentence in a tooltip rather than in the row", async () => {
    await open();
    filterNamed("unpinned").click();

    await vi.waitFor(() => expect(all(".mk-row")).toHaveLength(4));
    const chip = find(".mk-row .mk-meta .mk-chip-lost");
    const tip = chip.querySelector(".mk-tip");

    expect(chip.childNodes[0]?.textContent).toBe("Nothing matches");
    expect(tip?.textContent).toMatch(/^Nothing matches\. Every rung was tried\./);
    expect(getComputedStyle(tip as Element).opacity).toBe("0");
  });
});

describe("arming a pick", () => {
  it("collapses the island, so the chrome is out of the way of the picking", async () => {
    await open();
    const pick = all(".mk-pick")[0] as HTMLButtonElement;
    pick.click();

    await vi.waitFor(() => expect(root().querySelector(".mk-card")).toBeNull());
    expect(find(".mk-pill").getAttribute("data-armed")).toBe("true");
  });

  it("says which one is armed when the island is opened again", async () => {
    await open();
    (all(".mk-pick")[1] as HTMLButtonElement).click();
    await vi.waitFor(() => expect(root().querySelector(".mk-card")).toBeNull());

    find<HTMLButtonElement>(".mk-pill").click();
    await vi.waitFor(() => expect(root().querySelector(".mk-card")).not.toBeNull());
    expect(all(".mk-pick")[1]?.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("the list's entrance", () => {
  it("staggers six rows and lands the rest together, under 300ms", async () => {
    await open();
    const rows = all(".mk-row");
    const delays = rows.map((row) => Number.parseFloat(getComputedStyle(row).animationDelay));

    const ms = delays.map((delay) => Math.round(delay * 1000));
    expect(ms.slice(0, 6)).toEqual([0, 40, 80, 120, 160, 200]);
    for (const delay of ms.slice(6)) expect(delay).toBe(240);
    expect(Math.max(...ms)).toBeLessThan(300);
  });
});

describe("the settings", () => {
  it("toggle through and stay toggled when the island is shut", async () => {
    await open();
    find<HTMLButtonElement>('[aria-label="Settings"]').click();
    await vi.waitFor(() => expect(root().querySelector(".mk-settings")).not.toBeNull());

    switchNamed("Hide resolved").click();
    await vi.waitFor(() => expect(all(".mk-row")).toHaveLength(9));

    find<HTMLButtonElement>('[aria-label="Close the inventory"]').click();
    await vi.waitFor(() => expect(root().querySelector(".mk-card")).toBeNull());
    find<HTMLButtonElement>(".mk-pill").click();

    await vi.waitFor(() => expect(all(".mk-row")).toHaveLength(9));
  });

  it("keeps developer mode off by default and remembers it once it is on", async () => {
    await open();
    find<HTMLButtonElement>('[aria-label="Settings"]').click();
    await vi.waitFor(() => expect(root().querySelector(".mk-settings")).not.toBeNull());
    expect(switchNamed("Developer mode").getAttribute("aria-checked")).toBe("false");

    switchNamed("Developer mode").click();
    await vi.waitFor(() =>
      expect(switchNamed("Developer mode").getAttribute("aria-checked")).toBe("true"),
    );

    find<HTMLButtonElement>('[aria-label="Close the inventory"]').click();
    await vi.waitFor(() => expect(root().querySelector(".mk-card")).toBeNull());
    find<HTMLButtonElement>(".mk-pill").click();
    await vi.waitFor(() => expect(root().querySelector(".mk-card")).not.toBeNull());
    find<HTMLButtonElement>('[aria-label="Settings"]').click();

    await vi.waitFor(() =>
      expect(switchNamed("Developer mode").getAttribute("aria-checked")).toBe("true"),
    );
  });

  /**
   * A setting with two states is a switch. The theme has three and the corner
   * has four, and neither collapses into one without losing a state.
   */
  it("is a switch where there are two states and a group where there are more", async () => {
    await open();
    find<HTMLButtonElement>('[aria-label="Settings"]').click();

    await vi.waitFor(() => expect(all('[role="switch"]')).toHaveLength(2));
    expect(all('[role="radiogroup"]')).toHaveLength(2);
    expect(all(".mk-seg-one")).toHaveLength(3);
    expect(all(".mk-corner")).toHaveLength(4);
  });
});

describe("a row", () => {
  it("says who, what and what it is on, and nothing developer-only", async () => {
    await open();
    const row = find(".mk-row");

    expect(row.textContent).toContain("Sam");
    expect(row.textContent).toContain("This should say MRR, not revenue.");
    expect(row.textContent).toContain("on Mrr card");
    expect(row.textContent).not.toContain("kpi-mrr");
    expect(row.textContent).not.toContain("%");
  });

  it("names the status only when it is not the ordinary one", async () => {
    await open();
    const open3 = all('.mk-row[data-status="open"]')[0]!;
    const reverify = find('.mk-row[data-status="needs_reverify"]');

    expect(open3.querySelector(".mk-chip-info")).toBeNull();
    expect(reverify.textContent).toContain("Needs re-verify");
  });

  it("clamps a long body until it is asked to show all of it", async () => {
    await open();
    const row = all(".mk-row")[1]!;
    const more = row.querySelector<HTMLButtonElement>(".mk-more")!;

    expect(more.textContent).toBe("Show all");
    expect(row.getAttribute("data-mk-expanded")).toBe("false");
    more.click();
    await vi.waitFor(() => expect(row.getAttribute("data-mk-expanded")).toBe("true"));
    expect(row.querySelector(".mk-more")?.textContent).toBe("Show less");
  });

  it("draws an unverified author more quietly than a verified one", async () => {
    await open();
    const guest = find('.mk-who[data-provenance="guest"]');
    const server = find('.mk-who[data-provenance="server"]');

    expect(getComputedStyle(guest.querySelector(".mk-name")!).fontWeight).toBe("500");
    expect(getComputedStyle(server.querySelector(".mk-name")!).fontWeight).toBe("600");
  });
});

describe("the card", () => {
  it("opens with the island's own easing and closes faster than it opens", async () => {
    const card = await open();
    const entrance = getComputedStyle(card);

    expect(entrance.animationName).toBe("mk-island-in");
    expect(entrance.animationDuration).toBe("0.25s");
    expect(entrance.animationTimingFunction).toBe("cubic-bezier(0.22, 1, 0.36, 1)");

    find<HTMLButtonElement>('[aria-label="Close the inventory"]').click();
    await vi.waitFor(() => {
      expect(getComputedStyle(find(".mk-card")).animationDuration).toBe("0.15s");
    });
  });
});
