/**
 * The lockup: the leaf and the word, as one object.
 *
 * A composite rather than two parts a caller assembles, because the two are
 * only correct together — the leaf's mass sits below its box centre, so a
 * box-centred word reads high beside it, and that correction belongs here
 * once instead of at every call site. Sized by `size`, which is the leaf's
 * edge in pixels; the word takes its height from the same number.
 */

import { createElement, forwardRef } from "react";

import { LEAF_ROTATION, LEAF_SOLID, LEAF_VIEW_BOX } from "../marks/leaf.js";
import { WORDMARK_PATH, WORDMARK_RATIO, WORDMARK_VIEW_BOX } from "../marks/wordmark.js";
import { cx, renderPart } from "../part.js";
import { ISLAND_COPY } from "./language.js";

import type { PartProps } from "../part.js";
import type { ReactElement } from "react";

/** The leaf's edge, in pixels, when nothing says otherwise. */
export const WORDMARK_SIZE_PX = 17;

/**
 * The word is 0.86 of the leaf's edge. At parity the leaf overpowers a
 * lowercase word whose x-height is half its own box; this is where the two
 * read as one weight.
 */
export const WORDMARK_WORD_SCALE = 0.86;

/** The lockup. `size` is the leaf's edge; everything else follows it. */
export interface WordmarkProps extends PartProps {
  /** The leaf's edge in pixels. The word is scaled from it. */
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
      viewBox: LEAF_VIEW_BOX,
    },
    createElement("g", { transform: LEAF_ROTATION }, createElement("path", { d: LEAF_SOLID })),
  );
}

function word(size: number): ReactElement {
  const height = size * WORDMARK_WORD_SCALE;

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
        role: "img",
        "aria-label": label ?? ISLAND_COPY.wordmark,
        ref,
      },
      [leaf(size), word(size)],
    );
  },
);
