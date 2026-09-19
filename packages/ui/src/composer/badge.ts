/**
 * `Maple.Context`: what the page looked like, at the moment of writing.
 *
 * Half of what Maple has and a comment box does not, which is why it is on
 * screen while the comment is written rather than behind a disclosure. It is
 * a labelled list rather than a line of monospace: a wall of mono was the
 * wrong shape for the one fact a reviewer actually reads off it, which is how
 * wide the layout was. `contextRows` builds it from a captured page or from a
 * stored comment — one builder, two inputs, so the two cannot drift.
 */

import { contextRows } from "@maple-kit/core/overlay";
import { useMaple } from "@maple-kit/react";
import { createElement, forwardRef, Fragment } from "react";

import { Slot } from "../slot.js";

import type { AsChildProps } from "../slot.js";
import type { CommentContext } from "@maple-kit/core";
import type { ContextRow, PageContext } from "@maple-kit/core/overlay";
import type { ReactNode } from "react";

/** The badge. The context defaults to the one the pick captured. */
export interface MapleContextProps extends AsChildProps {
  readonly className?: string;
  /** A captured page, or a stored comment's context. Both render identically. */
  readonly context?: CommentContext | PageContext;
}

/** Labels muted, values aligned, two columns. */
export const MapleContextBadge = /** @__PURE__ */ forwardRef<HTMLElement, MapleContextProps>(
  function MapleContextBadge(props, ref) {
    const { composer, detail } = useMaple();
    const context = props.context ?? composer.target?.context;
    const Element = (props.asChild ? Slot : "dl") as "dl";

    if (!context) return null;

    const className = ["mk-composer-row", "mk-ctx", props.className].filter(Boolean).join(" ");
    return createElement(Element, { ref, className }, ...contextRows(context, detail).map(row));
  },
);

/**
 * A label and its value. The pair is a fragment rather than a wrapper, so the
 * two columns are the list's own grid and every value lines up.
 */
function row(one: ContextRow): ReactNode {
  return createElement(
    Fragment,
    { key: one.label },
    createElement("dt", null, one.label),
    createElement(
      "dd",
      one.mono === true ? { className: "mk-mono" } : null,
      one.value,
      one.note === undefined ? null : createElement("em", null, ` · ${one.note}`),
    ),
  );
}
