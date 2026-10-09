import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { MapleComposer, MapleDetail, MapleTarget } from "../src/composer/index.js";
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
import { MarkLayer } from "../src/marks/index.js";
import { BRANCH, fixtureFetch, PAGE_HTML } from "./fixtures.js";

import type { MapleRootProps } from "../src/index.js";
import type { Comment } from "@maple-kit/core";
import type { ReactElement } from "react";

/** The island, the marks and the ring: the whole composition a link lands on. */
function mount(props: Partial<MapleRootProps> = {}): ReactElement {
  return createElement(
    MapleRoot,
    { branch: BRANCH, theme: "light", options: { fetch: fixtureFetch() }, ...props },
    createElement(MarkLayer),
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
        ),
      ),
    ),
    createElement(MapleComposer, null, createElement(MapleTarget), createElement(MapleDetail)),
  );
}

function overlay(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-maple-overlay]");
}

function root(): ShadowRoot {
  const host = overlay();
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

function switchNamed(label: string): HTMLButtonElement {
  const row = all(".mk-setting").find((one) => one.textContent?.startsWith(label));
  const found = row?.querySelector<HTMLButtonElement>(".mk-switch");
  if (!found) throw new Error(`no setting reads ${label}`);
  return found;
}

/** Opens the island and waits for the rows the fixtures produce. */
async function open(): Promise<void> {
  await vi.waitFor(() => expect(find(".mk-pill").textContent).toContain("open"));
  find<HTMLButtonElement>(".mk-pill").click();
  await vi.waitFor(() => expect(all(".mk-row").length).toBeGreaterThan(0));
}

/** Turns developer detail on through the settings the island actually shows. */
async function developer(): Promise<void> {
  await open();
  find<HTMLButtonElement>('[aria-label="Settings"]').click();
  await vi.waitFor(() => expect(all(".mk-setting").length).toBeGreaterThan(0));
  switchNamed("Developer mode").click();
  await vi.waitFor(() =>
    expect(switchNamed("Developer mode").getAttribute("aria-checked")).toBe("true"),
  );
}

/**
 * Opens the panel on one written comment, where the facts now live. The row is
 * named so the fixture page answers its anchor and a rung is real.
 */
async function read(says = "The yield number"): Promise<HTMLElement> {
  const settings = root().querySelector<HTMLElement>(".mk-settings");
  if (settings) find<HTMLButtonElement>('[aria-label="Settings"]').click();

  const row = all(".mk-row").find((one) => one.textContent?.includes(says));
  if (!row) throw new Error(`no row says ${says}`);
  (row as HTMLElement).click();
  await vi.waitFor(() => expect(find(".mk-composer").getAttribute("data-mk-open")).toBe("true"));
  await vi.waitFor(() => expect(root().querySelector(".mk-detail")).not.toBeNull());
  return find<HTMLElement>(".mk-detail");
}

/** Every label the panel's block wrote, in order. */
function labels(block: HTMLElement): string[] {
  return [...block.querySelectorAll("dt")].map((one) => one.textContent ?? "");
}

/** The value beside one of those labels, its sentence included. */
function valueOf(block: HTMLElement, label: string): string {
  const terms = [...block.querySelectorAll("dt")];
  const at = terms.findIndex((one) => one.textContent === label);
  if (at < 0) throw new Error(`the panel wrote no ${label}`);
  return block.querySelectorAll("dd")[at]?.textContent ?? "";
}

/**
 * The page the fixtures point at: enough of it resolves that a rung, a
 * confidence and a ring are all real rather than asserted against nothing.
 */
const ANCHORED_HTML = `
${PAGE_HTML}
<div data-maple-name="YieldCard" style="height: 60px">Yield</div>
<div id="settings-panel" style="height: 60px">Settings panel</div>
`;

/** A pointer gesture on the pill, in real events with real coordinates. */
function drag(from: [number, number], to: [number, number]): void {
  const pill = find<HTMLElement>(".mk-pill");
  const at = (type: string, [clientX, clientY]: [number, number]) =>
    pill.dispatchEvent(
      new PointerEvent(type, { clientX, clientY, pointerId: 1, bubbles: true, cancelable: true }),
    );

  at("pointerdown", from);
  at("pointermove", to);
  at("pointerup", to);
}

let search = "";

beforeEach(async () => {
  localStorage.clear();
  document.documentElement.setAttribute("data-theme", "light");
  const fixture = document.createElement("div");
  fixture.setAttribute("data-fixture-page", "");
  fixture.innerHTML = ANCHORED_HTML;
  document.body.append(fixture);
  history.replaceState({}, "", search === "" ? location.pathname : `?${search}`);
  await render(mount());
});

afterEach(() => {
  search = "";
  history.replaceState({}, "", location.pathname);
  document.documentElement.removeAttribute("data-theme");
  for (const node of document.querySelectorAll("[data-maple-overlay], [data-fixture-page]")) {
    node.remove();
  }
});

/**
 * Nothing is recorded differently in either detail — the export fence carries
 * every field — which is exactly what makes defaulting to Default safe.
 */
describe("default detail", () => {
  it("names what a comment is on, and none of how it is found again", async () => {
    await open();
    const row = find(".mk-row");

    expect(row.textContent).toContain("on ");
    expect(row.textContent).not.toContain("%");
    expect(row.textContent).not.toContain(".tsx:");
  });

  /**
   * The panel is read, not scanned, so the two facts a row only hints at —
   * whose word this is, and where it is in its life — are words here.
   */
  it("says who wrote it and what its status means, in the panel, either way", async () => {
    await open();
    const block = await read();

    expect(labels(block)).toEqual(["Written by", "Status"]);
    expect(valueOf(block, "Written by")).toContain("dot");
    expect(valueOf(block, "Status")).toMatch(/Open|Resolved|Needs re-verify|Unpinned/);
  });

  it("says a row can be clicked, because clicking one opens the comment", async () => {
    await open();

    expect(getComputedStyle(find(".mk-row")).cursor).toBe("pointer");
  });
});

/**
 * One comment, drawn twice, has to be drawn the same twice. The row's leaf and
 * the mark on the page take their form and their paint from the same rules.
 */
describe("the row's leaf and the mark", () => {
  it("draws the row's leaf from the comment's status, not from its author", async () => {
    await open();
    const row = all(".mk-row").find((one) => one.textContent?.includes("The title wraps"));
    const leaf = row?.querySelector(".mk-rowleaf");

    expect(leaf?.getAttribute("data-status")).toBe("needs_reverify");
    expect(leaf?.getAttribute("data-form")).toBe("partial");
  });

  it("gives them one paint, so neither can be restyled without the other", async () => {
    await open();
    const leaf = find<HTMLElement>(".mk-rowleaf .mk-leaf-edge");
    const accent = getComputedStyle(find(".mk-row")).getPropertyValue("--mk-accent").trim();

    expect(getComputedStyle(leaf).fill).toBe(accent);
  });

  /** A half-filled leaf puts the waterline through the glyph. */
  it("strokes the number on a half leaf in the leaf's own colour", async () => {
    await open();
    const row = all(".mk-row").find((one) => one.textContent?.includes("The title wraps"));
    const number = row?.querySelector<HTMLElement>(".mk-mark-n");
    const leaf = row?.querySelector(".mk-leaf-body");
    const style = getComputedStyle(number!);

    expect(style.paintOrder).toContain("stroke");
    expect(Number.parseFloat(style.webkitTextStrokeWidth)).toBeGreaterThan(0);
    expect(style.webkitTextStrokeColor).toBe(getComputedStyle(leaf!).fill);
  });

  /** The number holds the share of the leaf it holds on the page: 11 in 38. */
  it("keeps the number inside the leaf at row scale", async () => {
    await open();
    const leaf = find<HTMLElement>(".mk-rowleaf");
    const number = leaf.querySelector<HTMLElement>(".mk-mark-n")!;
    const size = Number.parseFloat(getComputedStyle(number).fontSize);

    expect(size / leaf.getBoundingClientRect().width).toBeLessThan(0.3);
  });

  it("carries the address the page carries, and no second spelling of it", async () => {
    await open();
    const numbers = all(".mk-rowleaf .mk-mark-n").map((one) => one.textContent);

    expect(numbers.length).toBeGreaterThan(0);
    expect(numbers.every((text) => /^\d+$/.test(text ?? ""))).toBe(true);
    expect(root().querySelector(".mk-index")).toBeNull();
  });
});

/** Centres, in CSS pixels: a client rect is scaled by the runner's zoom. */
function centre(node: HTMLElement): number {
  return node.offsetLeft + node.offsetWidth / 2;
}

/**
 * The marks carry a whole collision resolver for this: two controls a thumb
 * cannot tell apart are two controls that get pressed wrong.
 */
describe("the header's two controls", () => {
  it("keep their hit areas off each other", async () => {
    await open();
    const [settings, close] = all(".mk-head .mk-iconbtn") as HTMLElement[];
    const hit = Number.parseFloat(getComputedStyle(settings!, "::after").width);

    expect(hit).toBeGreaterThanOrEqual(40);
    expect(centre(close!) - centre(settings!)).toBeGreaterThanOrEqual(hit);
  });
});

/** An outline follows the control's own corners, so nothing may force one. */
describe("the focus ring", () => {
  it("keeps a pill round when it takes focus", async () => {
    await open();
    const pill = find<HTMLButtonElement>(".mk-pill");
    pill.focus();

    expect(getComputedStyle(pill).borderTopLeftRadius).toBe("999px");
    expect(getComputedStyle(pill).outlineWidth).toBe("2px");
  });
});

describe("developer detail", () => {
  /**
   * A row is the same object in both detentes. The rung, the percentage and the
   * two paths belong where there is width for the sentence that explains them.
   */
  it("adds nothing at all to a row, in either detail", async () => {
    await developer();
    const row = find<HTMLElement>(".mk-row");

    expect(row.textContent).not.toContain("%");
    expect(row.textContent).not.toContain(".tsx:");
    expect(row.querySelector(".mk-mono")).toBeNull();
  });

  it("names the rung in words and the confidence as a percentage", async () => {
    await developer();
    const block = await read();
    const rung = valueOf(block, "Found again by");

    expect(rung).toMatch(/%/);
    expect(rung).toMatch(/the component name|the source line|the quoted text|a CSS path/);
    expect(rung).toContain("a lower rung is worth less");
    expect(rung).not.toContain("confidence:");
  });

  it("carries the source line as a value, never as a field name", async () => {
    await developer();
    const block = await read();

    expect(labels(block)).toContain("Source");
    expect(valueOf(block, "Source")).toContain(".tsx:");
    expect(block.textContent).not.toContain("source:");
  });

  /** c5 records a CSS path and nothing above it, which is the last rung. */
  it("carries the CSS path too, on a comment whose anchor is only one", async () => {
    await developer();
    const block = await read("The panel opens under the header");

    expect(labels(block)).toContain("CSS path");
    expect(valueOf(block, "CSS path")).toBe("#settings-panel");
    expect(valueOf(block, "Found again by")).toContain("a CSS path");
    expect(block.textContent).not.toContain("selector:");
  });

  it("keeps a path on one line of its own rather than wrapping the block", async () => {
    await developer();
    const block = await read();
    const path = block.querySelector<HTMLElement>(".mk-mono");

    expect(path).not.toBeNull();
    expect(getComputedStyle(path!).wordBreak).toBe("break-all");
  });

  /**
   * Which rungs were tried on the way to giving up is the developer's half of
   * why a comment lost its place, and it needs the sentence around it.
   */
  it("names the rungs an unpinned comment tried before it gave up", async () => {
    await developer();
    find<HTMLElement>('[aria-label="Show"]')?.click();
    const block = await read("The empty state here is doing nothing");

    expect(labels(block)).toContain("Nothing to pin to");
    expect(valueOf(block, "Nothing to pin to")).toContain("Tried: ");
  });
});

/** A row is scanned, so it explains nothing: no legend, no help tooltip. */
describe("the row's legend", () => {
  it("draws no tooltip for a name, a leaf or a chip", async () => {
    await open();

    expect(root().querySelector(".mk-tip")).toBeNull();
    expect(root().querySelector("[role=tooltip]")).toBeNull();
    expect(root().querySelector(".mk-name")?.getAttribute("aria-describedby")).toBeNull();
  });
});

describe("the island's corner", () => {
  it("starts bottom-right and snaps to the corner a drag lets it go in", async () => {
    await vi.waitFor(() =>
      expect(find(".mk-island").getAttribute("data-mk-corner")).toBe("bottom-right"),
    );
    const island = find<HTMLElement>(".mk-island");
    const start = island.getBoundingClientRect();

    drag([start.x + start.width / 2, start.y + start.height / 2], [90, 60]);
    await vi.waitFor(() => expect(island.getAttribute("data-mk-corner")).toBe("top-left"));
    expect(island.hasAttribute("data-mk-dragging")).toBe(false);
    expect(island.style.getPropertyValue("--mk-x")).toBe("");
  });

  it("remembers the corner, per origin, for the next page that mounts", async () => {
    const island = find<HTMLElement>(".mk-island");
    const start = island.getBoundingClientRect();

    drag([start.x + start.width / 2, start.y + start.height / 2], [90, 60]);
    await vi.waitFor(() => expect(island.getAttribute("data-mk-corner")).toBe("top-left"));

    const stored = localStorage.getItem(`maple:prefs:${location.origin}`);
    expect(JSON.parse(stored ?? "{}")).toMatchObject({ position: "top-left" });
  });

  it("does not open the island on the click that ends a drag", () => {
    const island = find<HTMLElement>(".mk-island");
    const start = island.getBoundingClientRect();

    drag([start.x + start.width / 2, start.y + start.height / 2], [90, 60]);
    find<HTMLButtonElement>(".mk-pill").click();

    expect(root().querySelector(".mk-card")).toBeNull();
  });
});

describe("hidden for the session", () => {
  it("takes the island off the page and leaves the overlay mounted under it", async () => {
    await open();
    find<HTMLButtonElement>('[aria-label="Settings"]').click();
    await vi.waitFor(() => expect(all(".mk-setting").length).toBeGreaterThan(0));
    const hide = all(".mk-setting").find((one) => one.textContent?.startsWith("Hide the island"));
    hide?.querySelector<HTMLButtonElement>(".mk-more")?.click();

    await vi.waitFor(() => expect(root().querySelector(".mk-island")).toBeNull());
    expect(overlay()).not.toBeNull();
  });
});

/** The link a pull-request comment carries, and what it has to land on. */
describe("the query string", () => {
  it("mounts nothing at all for ?maple=off", async () => {
    for (const node of document.querySelectorAll("[data-maple-overlay]")) node.remove();
    history.replaceState({}, "", "?maple=off");
    await render(mount());

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(overlay()).toBeNull();
  });

  it("opens the island on the comment a link names, and draws its ring", async () => {
    for (const node of document.querySelectorAll("[data-maple-overlay]")) node.remove();
    history.replaceState({}, "", "?maple-comment=c5&maple-pos=top-left");
    await render(mount());

    await vi.waitFor(() => expect(root().querySelector(".mk-card")).not.toBeNull());
    await vi.waitFor(() =>
      expect(find(".mk-row[data-mk-selected='true']")).toBeInstanceOf(HTMLElement),
    );
    expect(find(".mk-island").getAttribute("data-mk-corner")).toBe("top-left");
    await vi.waitFor(() => expect(find(".mk-ring").getAttribute("data-mk-off")).not.toBe("true"));
  });

  it("opens in developer detail when the link asks for it", async () => {
    for (const node of document.querySelectorAll("[data-maple-overlay]")) node.remove();
    history.replaceState({}, "", "?maple-detail=developer");
    await render(mount());

    await open();
    const block = await read();
    expect(labels(block)).toContain("Found again by");
  });

  it("arms the pick a link asks for, without anything being pressed", async () => {
    for (const node of document.querySelectorAll("[data-maple-overlay]")) node.remove();
    history.replaceState({}, "", "?maple-new=text");
    await render(mount());

    await vi.waitFor(() => expect(find(".mk-pill").getAttribute("data-armed")).toBe("true"));
  });
});
