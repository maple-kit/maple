/**
 * The lockup: the leaf and the word, as one object.
 *
 * A composite rather than two parts a caller assembles, because each drawing's
 * mass sits off its own box centre, so two box-centred boxes read as one high
 * half and one low one. That correction belongs here once. Sized by `size`,
 * the leaf's edge in pixels; the word and the gap follow it.
 *
 * The leaf here is the brand's, `pixel-leaf.ts`, and only here. */

import { createElement, forwardRef } from "react";

import { cx } from "../cx.js";
import { PIXEL_LEAF_SHADES, PIXEL_LEAF_VIEW_BOX } from "../marks/pixel-leaf.js";
import { WORDMARK_PATH, WORDMARK_RATIO, WORDMARK_VIEW_BOX } from "../marks/wordmark.js";
import { renderPart } from "../part.js";
import { ISLAND_COPY } from "./language.js";

import type { PartProps } from "../part.js";
import type { ReactElement } from "react";

/** The leaf's edge, in pixels, when nothing says otherwise. */
export const WORDMARK_SIZE_PX = 17;

/**
 * The word is 0.90 of the leaf's edge. The pixel leaf is ink for 26 of its 28
 * cells, so a word scaled for a drawing that filled less of its box reads
 * short beside it, and at parity the leaf still overpowers a lowercase word
 * whose x-height is half its own box. This is where the two read as one.
 */
export const WORDMARK_WORD_SCALE = 0.9;

/** The gap, as a fraction of the leaf's edge. This leaf ends where its box
 *  ends: it has no tips to carry the air, and butted against the word it
 *  reads as a collision. */
const WORDMARK_GAP = 0.2;

/** Each drawing's centre of mass, as a fraction of its own box: the leaf's
 *  13.42 of 28 sits a little above centre, the word's 0.5076 a little below.
 *  The word closes both halves, which is why the rise takes both numbers. */
const LEAF_MASS = 13.42 / 28;
const WORD_MASS = 0.5076;

/** The lockup. `size` is the leaf's edge; everything else follows it. */
export interface WordmarkProps extends PartProps {
  /** The leaf's edge in pixels. The word and the gap are scaled from it. */
  readonly size?: number;
  /** Overrides the accessible name, which is otherwise the product's. */
  readonly label?: string;
}

function leaf(size: number): ReactElement {
  return createElement(
    "svg",
    {
      key: "leaf",
      "aria-hidden": true,
      focusable: false,
      className: "mk-wordmark-leaf",
      width: size,
      height: size,
      viewBox: PIXEL_LEAF_VIEW_BOX,
      shapeRendering: "crispEdges",
    },
    PIXEL_LEAF_SHADES.map(([colour, d]) => createElement("path", { key: colour, d, fill: colour })),
  );
}

function word(size: number): ReactElement {
  const height = size * WORDMARK_WORD_SCALE;
  const rise = (0.5 - LEAF_MASS) * size + (WORD_MASS - 0.5) * height;

  return createElement(
    "svg",
    {
      key: "word",
      "aria-hidden": true,
      focusable: false,
      className: "mk-wordmark-word",
      width: height * WORDMARK_RATIO,
      height,
      viewBox: WORDMARK_VIEW_BOX,
      style: { transform: `translateY(${-rise}px)` },
    },
    createElement("path", { d: WORDMARK_PATH }),
  );
}

/** The leaf and the word, drawn together and named once. */
export const Wordmark = /** @__PURE__ */ forwardRef<HTMLSpanElement, WordmarkProps>(
  function Wordmark(props, ref) {
    const { asChild, className, label, size = WORDMARK_SIZE_PX, ...rest } = props;

    return renderPart(
      "span",
      asChild,
      {
        ...rest,
        className: cx("mk-wordmark", className),
        style: { gap: `${size * WORDMARK_GAP}px` },
        role: "img",
        "aria-label": label ?? ISLAND_COPY.wordmark,
        ref,
      },
      [leaf(size), word(size)],
    );
  },
);
