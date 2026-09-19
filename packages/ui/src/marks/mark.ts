/**
 * One mark: a numbered leaf standing just outside what it is about.
 *
 * Three signals never compete for the same pixel — the fill says how far
 * through its life the comment is, the edge says how sure the anchor is, the
 * colour says its status. The number inside is the address, the same one the
 * list and the export table use, so a reviewer never translates between them.
 */

import { createElement, forwardRef, useCallback } from "react";

import { confidenceFor, dataAttributes, formFor } from "../data.js";
import { composeRefs, Slot } from "../slot.js";
import { applyReviewerSlot } from "../slots.js";
import { markLabel, markTitle } from "./label.js";
import { inside, MapleLeaf } from "./shape.js";

import type { AsChildProps } from "../slot.js";
import type { CommentStatus } from "@maple-kit/core";
import type { ButtonHTMLAttributes } from "react";

/** Everything the mark says, and nothing about how it should look. */
export interface MarkProps extends AsChildProps, ButtonHTMLAttributes<HTMLButtonElement> {
  /** The address: the number the list and the export table also show. */
  readonly address: number;
  readonly status?: CommentStatus;
  /** False for a comment still being written, which is the dashed form. */
  readonly sent?: boolean;
  /** How sure the anchor is, 0 to 1. A weak one draws a translucent fill. */
  readonly confidence?: number;
  /** The author's reviewer colour, 0 to 9. Absent leaves the status colour. */
  readonly colorSlot?: number;
  readonly author?: string;
  /** What it is on, for the tooltip: "the Yield card". */
  readonly on?: string;
  readonly selected?: boolean;
}

/** A mark a reviewer can click, drawn from state that arrives as `data-*`. */
export const MapleMark = /** @__PURE__ */ forwardRef<HTMLButtonElement, MarkProps>(
  function MapleMark(props, ref) {
    const {
      address,
      asChild,
      author,
      children,
      className,
      colorSlot,
      confidence,
      on,
      selected,
      sent,
      status = "open",
      ...rest
    } = props;
    const form = formFor(status, sent ?? true);

    const paint = useCallback(
      (node: HTMLButtonElement | null) => {
        if (node && colorSlot !== undefined) applyReviewerSlot(node, colorSlot);
      },
      [colorSlot],
    );

    const Element = asChild ? Slot : "button";
    return createElement(
      Element,
      {
        type: "button",
        ...rest,
        ...dataAttributes({
          status,
          form,
          sent: sent ?? true,
          ...(confidence === undefined ? {} : { confidence: confidenceFor(confidence) }),
        }),
        "aria-label": markLabel(address, author, status),
        "aria-pressed": selected ?? false,
        title: markTitle(author, status, on),
        className: className ? `mk-mark mk-hit ${className}` : "mk-mark mk-hit",
        ref: composeRefs<HTMLButtonElement>(ref, paint),
      },
      ...inside(asChild, children, [
        createElement(MapleLeaf, { key: "leaf", form }),
        createElement("span", { key: "n", className: "mk-mark-n mk-num" }, address),
      ]),
    );
  },
);
