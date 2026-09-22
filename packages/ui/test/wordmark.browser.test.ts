import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { MapleRoot } from "../src/index.js";
import { Wordmark, WORDMARK_SIZE_PX, WORDMARK_WORD_SCALE } from "../src/island/index.js";
import { PIXEL_LEAF_SHADES } from "../src/marks/pixel-leaf.js";
import { WORDMARK_RATIO } from "../src/marks/wordmark.js";
import { offlineFetch } from "./offline.js";

import type { ReactElement, ReactNode } from "react";

const BRANCH = "feat/ui-wordmark";

function container(): HTMLElement {
  const found = document.querySelector<HTMLElement>("[data-maple-overlay]");
  if (!found) throw new Error("no overlay is mounted");
  return found;
}

function root(): ShadowRoot {
  const shadow = container().shadowRoot;
  if (!shadow) throw new Error("the overlay has no shadow root");
  return shadow;
}

function find<T extends Element>(selector: string): T {
  const found = root().querySelector<T>(selector);
  if (!found) throw new Error(`nothing matched ${selector}`);
  return found;
}

function token(name: string): string {
  return getComputedStyle(container()).getPropertyValue(name).trim();
}

/** The overlay, holding whatever the case is about. */
function mount(children: ReactNode): ReactElement {
  return createElement(
    MapleRoot,
    { branch: BRANCH, theme: "light", options: { fetch: offlineFetch() } },
    children,
  );
}

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the wordmark", () => {
  it("names itself once, and hides both drawings from the reader", async () => {
    await render(mount(createElement(Wordmark)));

    const mark = find<HTMLElement>(".mk-wordmark");
    expect(mark.getAttribute("role")).toBe("img");
    expect(mark.getAttribute("aria-label")).toBe("Maple");
    for (const svg of mark.querySelectorAll("svg")) {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("takes a caller's name in place of the product's", async () => {
    await render(mount(createElement(Wordmark, { label: "Review" })));

    expect(find(".mk-wordmark").getAttribute("aria-label")).toBe("Review");
  });

  it("scales the word off the leaf, so one number sizes the lockup", async () => {
    await render(mount(createElement(Wordmark, { size: 40 })));

    const leaf = find<SVGSVGElement>(".mk-wordmark-leaf");
    const word = find<SVGSVGElement>(".mk-wordmark-word");
    expect(leaf.getBoundingClientRect().width).toBeCloseTo(40, 0);
    expect(word.getBoundingClientRect().height).toBeCloseTo(40 * WORDMARK_WORD_SCALE, 0);
    expect(word.getBoundingClientRect().width).toBeCloseTo(
      40 * WORDMARK_WORD_SCALE * WORDMARK_RATIO,
      0,
    );
  });

  it("defaults to the size the header draws it at", async () => {
    await render(mount(createElement(Wordmark)));

    expect(find(".mk-wordmark-leaf").getBoundingClientRect().width).toBeCloseTo(
      WORDMARK_SIZE_PX,
      0,
    );
  });

  /* The two halves are their own ink box, so this is the drawing's own
     centring and not two boxes of whitespace agreeing by accident. Both
     masses move: the leaf's sits above its box centre and the word's below
     its own, so the rise is the two halves added. */
  it("centres the word's ink on the leaf's, off the box centre", async () => {
    await render(mount(createElement(Wordmark, { size: 60 })));

    const leaf = find(".mk-wordmark-leaf").getBoundingClientRect();
    const word = find(".mk-wordmark-word").getBoundingClientRect();
    const leafMiddle = leaf.top + leaf.height / 2;
    const wordMiddle = word.top + word.height / 2;
    const rise = (0.5 - 13.42 / 28) * 60 + (0.5076 - 0.5) * 60 * WORDMARK_WORD_SCALE;

    expect(wordMiddle).toBeLessThan(leafMiddle);
    expect(leafMiddle - wordMiddle).toBeCloseTo(rise, 1);
  });

  /* This leaf ends where its box ends. The old one had tips to carry the air
     and this rule replaces them, so a zero gap is a collision. */
  it("holds the word off the leaf by a fifth of the leaf's edge", async () => {
    await render(mount(createElement(Wordmark, { size: 60 })));

    const leaf = find(".mk-wordmark-leaf").getBoundingClientRect();
    const word = find(".mk-wordmark-word").getBoundingClientRect();

    expect(word.left - leaf.right).toBeCloseTo(12, 0);
  });

  it("paints the word in the foreground and leaves the leaf its own colours", async () => {
    await render(mount(createElement(Wordmark)));

    const leaf = find<SVGSVGElement>(".mk-wordmark-leaf");
    const paths = [...leaf.querySelectorAll("path")];

    expect(getComputedStyle(find(".mk-wordmark-word")).fill).toBe(token("--mk-fg"));
    expect(paths).toHaveLength(PIXEL_LEAF_SHADES.length);
    expect(paths.map((path) => path.getAttribute("fill"))).toEqual(
      PIXEL_LEAF_SHADES.map(([colour]) => colour),
    );
  });

  /* Without this the cells are smoothed into a blob at 24px and a poster at
     1024, which is the whole drawing gone. */
  it("draws the cells square at every size", async () => {
    await render(mount(createElement(Wordmark)));

    expect(find(".mk-wordmark-leaf").getAttribute("shape-rendering")).toBe("crispEdges");
  });
});
