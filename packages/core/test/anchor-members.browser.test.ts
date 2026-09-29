import { afterEach, describe, expect, it } from "vitest";

import {
  captureMembers,
  describeElement,
  labelFor,
  MAXIMUM_MEMBERS,
  membersBox,
  nameMembers,
  regionOf,
  resolveAnchor,
} from "../src/anchor/index.js";

import type { Anchor, Resolved } from "../src/anchor/index.js";
import type { RegionBox } from "../src/anchor/region.js";

let page: HTMLElement;

/** A page shell at a fixed place, so the rectangles below are plain numbers. */
function mount(html: string): HTMLElement {
  page = document.createElement("main");
  page.setAttribute("style", "position:absolute;left:0;top:0;width:600px;font:16px sans-serif");
  page.innerHTML = html;
  document.body.append(page);
  return page;
}

afterEach(() => page.remove());

const CARD = (name: string, text: string, style = "") =>
  `<section data-maple-name="${name}" data-maple-src="src/${name}.tsx:1:1" style="height:80px;margin:0 0 20px;${style}">${text}</section>`;

/** The rectangle around an element, grown by a margin the way a reviewer draws. */
function around(element: Element, margin = 6): RegionBox {
  const box = element.getBoundingClientRect();
  return {
    x: box.x - margin,
    y: box.y - margin,
    width: box.width + margin * 2,
    height: box.height + margin * 2,
  };
}

/** The anchor a region pick records: the container's rungs, its fractions and its members. */
function regionAnchor(rect: RegionBox, container: Element): Anchor {
  return {
    ...describeElement(container, { root: page }),
    region: regionOf(rect, container.getBoundingClientRect()),
    members: captureMembers(rect, { root: page }),
  };
}

function resolved(anchor: Anchor): Resolved {
  const outcome = resolveAnchor(anchor, { root: page });
  if (outcome.status !== "resolved") throw new Error(`orphaned: ${outcome.reason}`);
  return outcome;
}

function names(members: readonly { anchor: Anchor }[]): (string | undefined)[] {
  return members.map((member) => member.anchor.component);
}

describe("capturing what a rectangle covers", () => {
  it("records the card under a rectangle a little wider than it, not the page shell", () => {
    mount(`${CARD("BrewGuideCard", "How to dial in your espresso")}${CARD("Other", "Beans")}`);
    const card = page.querySelector("section")!;

    const members = captureMembers(around(card), { root: page });

    expect(names(members)).toEqual(["BrewGuideCard"]);
    expect(members[0]!.overlap).toBe(1);
    expect(members[0]!.offset).toEqual({ top: 6, left: 6, right: 6, bottom: 6 });
  });

  it("records two sibling cards and not the parent that holds both", () => {
    mount(
      `<div data-maple-name="Grid" data-maple-src="src/Grid.tsx:1:1">${CARD("YieldCard", "Yield")}${CARD("TimeCard", "Time")}</div>`,
    );
    const [first, second] = page.querySelectorAll("section");
    const rect = around(first!);
    const both = { ...rect, height: second!.getBoundingClientRect().bottom - rect.y + 6 };

    expect(
      names(captureMembers(both, { root: page })).toSorted((a, b) =>
        String(a).localeCompare(String(b)),
      ),
    ).toEqual(["TimeCard", "YieldCard"]);
  });

  it("drops a card the rectangle only clips", () => {
    mount(CARD("BrewGuideCard", "Guide"));
    const box = page.querySelector("section")!.getBoundingClientRect();

    const half = { x: box.x, y: box.y, width: box.width, height: box.height / 2 };
    expect(captureMembers(half, { root: page })).toEqual([]);
  });

  it("records nothing over a gap, so the container stays the subject", () => {
    mount(`${CARD("A", "First")}${CARD("B", "Second")}`);
    const [first] = page.querySelectorAll("section");
    const gap = { x: 10, y: first!.getBoundingClientRect().bottom + 4, width: 200, height: 10 };

    expect(captureMembers(gap, { root: page })).toEqual([]);
  });

  it("keeps the most covered members, up to the cap", () => {
    mount(
      Array.from({ length: 6 }, (_, i) => CARD(`Card${String(i)}`, `Item ${String(i)}`)).join(""),
    );
    const everything = { x: 0, y: 0, width: 600, height: 800 };

    expect(captureMembers(everything, { root: page })).toHaveLength(MAXIMUM_MEMBERS);
  });
});

describe("untagged elements", () => {
  it("count when they carry a quote, and are recorded without their ancestor's tags", () => {
    mount(
      `<h2 style="margin:0;height:40px">Espresso guide</h2><p style="margin:0">Grind fine.</p>`,
    );
    const heading = page.querySelector("h2")!;

    const [member] = captureMembers(around(heading), { root: page });

    expect(member!.anchor.quote?.exact).toBe("Espresso guide");
    expect(member!.anchor.selector).toBeTypeOf("string");
    expect(member!.anchor.component).toBeUndefined();
  });

  it("do not describe a tagged card twice through its own text", () => {
    mount(CARD("BrewGuideCard", "How to dial in your espresso"));
    const members = captureMembers(around(page.querySelector("section")!), { root: page });

    expect(names(members)).toEqual(["BrewGuideCard"]);
  });

  it("rank after tagged members", () => {
    mount(`${CARD("Card", "Tagged")}<h2 style="margin:0;height:200px">A very large heading</h2>`);
    const rect = { x: 0, y: 0, width: 600, height: 400 };

    const members = captureMembers(rect, { root: page });

    expect(members[0]!.anchor.component).toBe("Card");
    expect(members[1]!.anchor.quote?.exact).toBe("A very large heading");
  });
});

describe("placing a region again", () => {
  it("keeps the rectangle over the card when the container grows below it", () => {
    mount(`${CARD("BrewGuideCard", "How to dial in your espresso")}${CARD("Other", "Beans")}`);
    const card = page.querySelector("section")!;
    const rect = around(card);
    const anchor = regionAnchor(rect, page);

    page.insertAdjacentHTML("beforeend", `<div style="height:2000px">tail</div>`);
    const found = resolved(anchor);

    expect(found.members).toHaveLength(1);
    expect(membersBox(found.members!)).toEqual(rect);
  });

  it("follows the card when content above it pushes it down", () => {
    mount(CARD("BrewGuideCard", "How to dial in your espresso"));
    const card = page.querySelector("section")!;
    const rect = around(card);
    const anchor = regionAnchor(rect, page);

    page.insertAdjacentHTML("afterbegin", `<div style="height:300px">banner</div>`);

    const box = membersBox(resolved(anchor).members!);
    expect(box.y).toBe(rect.y + 300);
    expect(box.height).toBe(rect.height);
  });

  it("draws the rest, at lower confidence, when one member is gone", () => {
    mount(
      `<div>${CARD("YieldCard", "Yield ratio")}${CARD("TimeCard", "Zzzq quxxv jjkk")}${CARD("TempCard", "Water temperature")}</div>`,
    );
    const rect = { x: 0, y: 0, width: 600, height: 400 };
    const anchor = regionAnchor(rect, page);
    const whole = resolved(anchor);

    page.querySelector("[data-maple-name=TimeCard]")!.remove();
    const partial = resolved(anchor);

    expect(anchor.members).toHaveLength(3);
    expect(partial.members).toHaveLength(2);
    expect(partial.confidence).toBeLessThan(whole.confidence);
    expect(partial.confidence).toBeLessThan(0.65);
  });

  it("falls back to the container fractions when no member resolves", () => {
    mount(`<div id="box">${CARD("BrewGuideCard", "Guide")}</div>`);
    const rect = around(page.querySelector("section")!);
    const anchor = regionAnchor(rect, page.querySelector("#box")!);

    page.querySelector("section")!.remove();
    const found = resolved(anchor);

    expect(found.members).toBeUndefined();
    expect(found.element).toBe(page.querySelector("#box"));
  });

  it("orphans when neither the members nor the container are there", () => {
    mount(`<div id="box">${CARD("BrewGuideCard", "Guide")}</div>`);
    const anchor = regionAnchor(
      around(page.querySelector("section")!),
      page.querySelector("#box")!,
    );

    page.innerHTML = "<p>Something else entirely</p>";

    expect(resolveAnchor(anchor, { root: page }).status).toBe("orphaned");
  });

  it("holds confidence low when the members have moved apart", () => {
    mount(`${CARD("YieldCard", "Yield")}${CARD("TimeCard", "Time")}`);
    const anchor = regionAnchor({ x: 0, y: 0, width: 600, height: 400 }, page);
    const together = resolved(anchor);

    page.querySelector("[data-maple-name=TimeCard]")!.setAttribute("style", "margin-top:300px");
    const apart = resolved(anchor);

    expect(together.confidence).toBeGreaterThan(0.65);
    expect(apart.confidence).toBeLessThan(0.65);
    expect(apart.members).toHaveLength(2);
  });

  it("still resolves an anchor stored without members the old way", () => {
    mount(`<div id="box" data-maple-name="Box">${CARD("BrewGuideCard", "Guide")}</div>`);
    const box = page.querySelector("#box")!;
    const stored: Anchor = {
      ...describeElement(box, { root: page }),
      region: { x: 0, y: 0, width: 1, height: 1 },
    };

    const found = resolved(stored);

    expect(found.element).toBe(box);
    expect(found.members).toBeUndefined();
  });

  it("finds an untagged member by its quote", () => {
    mount(`<h2 style="margin:0;height:40px">Espresso guide</h2>`);
    const anchor = regionAnchor(around(page.querySelector("h2")!), page);

    page.insertAdjacentHTML("afterbegin", `<div style="height:120px">banner</div>`);

    expect(resolved(anchor).element).toBe(page.querySelector("h2"));
  });
});

describe("naming what a region covers", () => {
  it("reads as the first member and a count", () => {
    mount(`${CARD("BrewGuideCard", "Guide")}${CARD("SectionHeading", "Heading")}`);
    const anchor = regionAnchor({ x: 0, y: 0, width: 600, height: 400 }, page);

    expect(nameMembers(anchor)).toBe("BrewGuideCard +1");
    expect(nameMembers(anchor, { human: true })).toBe("Brew guide card +1");
    expect(labelFor({ anchor })).toBe("Brew guide card +1");
  });

  it("is nothing for an anchor with no members", () => {
    expect(nameMembers({})).toBeUndefined();
  });
});
