/**
 * `Maple.Context`: what the page looked like, at the moment of writing.
 *
 * Half of what Maple has and a comment box does not, which is why it is on
 * screen while the comment is written. It collapses rather than hides: the one
 * fact a reviewer reads off it is how wide the layout was, and the summary
 * keeps that line whatever else is folded away. `contextRows` builds both from
 * a captured page or a stored comment, so the two cannot drift.
 */

import { contextRows } from "@maple-kit/core/overlay";
import { useMaple, useMapleClient } from "@maple-kit/react";
import { createElement, forwardRef, Fragment } from "react";

import { Slot } from "../slot.js";

import type { AsChildProps } from "../slot.js";
import type { CommentContext } from "@maple-kit/core";
import type { ContextRow, PageContext } from "@maple-kit/core/overlay";
import type { ReactElement, ReactNode } from "react";

/** The badge. The context defaults to the one the pick captured. */
export interface MapleContextProps extends AsChildProps {
  readonly className?: string;
  /** A captured page, or a stored comment's context. Both render identically. */
  readonly context?: CommentContext | PageContext;
  /**
   * Whether it can be folded away. Off keeps it open and draws no control,
   * which is what a stored comment wants: nothing is being typed beside it.
   */
  readonly collapsible?: boolean;
}

/** What the disclosure is called, in both states. */
export const CONTEXT_LABELS = { closed: "Show what was captured", open: "Hide what was captured" };

/** Labels muted, values aligned, two columns — folded to its first row. */
export const MapleContextBadge = /** @__PURE__ */ forwardRef<HTMLElement, MapleContextProps>(
  function MapleContextBadge(props, ref) {
    const { composer } = useMaple();
    const client = useMapleClient();
    const context = props.context ?? composer.target?.context;
    const Element = (props.asChild ? Slot : "section") as "section";

    if (!context) return null;

    const rows = contextRows(context);
    const collapsible = props.collapsible !== false && composer.viewing === undefined;
    const open = !collapsible || composer.contextOpen;

    return createElement(
      Element,
      {
        ref,
        className: ["mk-composer-row", "mk-ctx-card", props.className].filter(Boolean).join(" "),
        "data-mk-open": String(open),
      },
      collapsible ? head(rows, open, () => client.setContextOpen(!open)) : null,
      createElement("dl", { className: "mk-ctx" }, ...rows.map(row)),
    );
  },
);

/**
 * The summary, and the control that unfolds it. It carries the first row's
 * value rather than a word like "Context", because that row is the fact.
 */
function head(rows: readonly ContextRow[], open: boolean, toggle: () => void): ReactElement {
  const first = rows[0];
  return createElement(
    "button",
    {
      type: "button",
      className: "mk-ctx-head mk-press",
      "aria-expanded": open,
      "aria-label": open ? CONTEXT_LABELS.open : CONTEXT_LABELS.closed,
      onClick: toggle,
    },
    createElement("span", { className: "mk-ctx-sum" }, first === undefined ? "Page" : first.value),
    createElement("span", { className: "mk-ctx-caret", "aria-hidden": "true" }),
  );
}

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
