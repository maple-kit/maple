/**
 * `Maple.Filters`: one select, and a tally of what is behind it.
 *
 * Five pills did not fit the card at any width worth having, and the fifth
 * was always half off the edge. What a reviewer needs at rest is the count
 * per status, which is four dots and four numbers; what they need
 * occasionally is to narrow the list, which is a select. The dots carry the
 * same colours as the marks on the page, so the row reads as a key to them.
 */

import { useMaple, useMapleClient } from "@maple-kit/react";
import { createElement, forwardRef } from "react";

import { cx } from "../cx.js";
import { renderPart } from "../part.js";
import { Tip } from "../tip.js";
import { countsFor } from "./comments.js";
import { listId, useIsland } from "./context.js";
import { FILTER_LABELS, FILTER_ORDER, FILTERS_LABEL, TALLY_ORDER, tallyTitle } from "./language.js";

import type { PartProps } from "../part.js";
import type { CommentFilter } from "@maple-kit/core/client";
import type { ChangeEvent, ReactNode } from "react";

/** The filter row. Its own children replace the select and the tally. */
export interface FiltersProps extends PartProps {
  readonly children?: ReactNode;
}

const PART = "<Maple.Filters>";

/** Every filter in one select, with the per-status tally beside it. */
export const Filters = /** @__PURE__ */ forwardRef<HTMLDivElement, FiltersProps>(
  function Filters(props, ref) {
    const { asChild, children, className, ...rest } = props;
    const island = useIsland(PART);
    const { comments, filter, showResolved } = useMaple();
    const client = useMapleClient();

    const counts = countsFor(comments, showResolved);
    const onChange = (event: ChangeEvent<HTMLSelectElement>) => {
      client.setFilter(event.currentTarget.value as CommentFilter);
    };

    const select = renderPart(
      "span",
      false,
      { key: "chip", className: "mk-filter-chip" },
      renderPart(
        "select",
        false,
        {
          className: "mk-filter-pick",
          "aria-controls": listId(island.contentId),
          "aria-label": FILTERS_LABEL,
          value: filter,
          onChange,
        },
        ALL_FILTERS.map((name) =>
          renderPart(
            "option",
            false,
            { key: name, value: name },
            `${FILTER_LABELS[name]} ${String(counts[name])}`,
          ),
        ),
      ),
    );

    const tally = renderPart(
      "div",
      false,
      { key: "tally", className: "mk-tally" },
      TALLY_ORDER.map((name) =>
        createElement(
          Tip,
          {
            key: name,
            as: "button",
            className: "mk-tally-one",
            sentence: tallyTitle(name, counts[name]),
            triggerProps: {
              type: "button",
              "data-tally": name,
              "data-mk-zero": String(counts[name] === 0),
              "aria-pressed": filter === name,
              "aria-label": tallyTitle(name, counts[name]),
              onClick: () => client.setFilter(filter === name ? "all" : name),
            },
          },
          renderPart("span", false, { key: "dot", className: "mk-dot" }),
          renderPart("span", false, { key: "n", className: "mk-num" }, String(counts[name])),
        ),
      ),
    );

    return renderPart(
      "div",
      asChild,
      { ...rest, className: cx("mk-filters", className), ref },
      children ?? [select, tally],
    );
  },
);

/** The select offers every filter; the tally covers the four with a colour. */
const ALL_FILTERS: readonly CommentFilter[] = [...FILTER_ORDER, "unpinned"];
