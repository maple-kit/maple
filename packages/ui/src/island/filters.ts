/**
 * `Maple.Filters`: the status line: a select, a tally of what is behind it, and
 * whatever else the composition puts on that line.
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
import { countsFor } from "./comments.js";
import { listId, useIsland } from "./context.js";
import { FILTER_LABELS, FILTER_ORDER, FILTERS_LABEL, TALLY_ORDER, tallyLabel } from "./language.js";
import { useSavedDrafts } from "./saved.js";

import type { PartProps } from "../part.js";
import type { CommentFilter } from "@maple-kit/core/client";
import type { ChangeEvent, ReactNode } from "react";

/** The filter row. Its children are the controls on it, in the order given. */
export interface FiltersProps extends PartProps {
  readonly children?: ReactNode;
}

const PART = "<Maple.Filters>";

/** The row that holds the select, the tally and whatever else sits on that line. */
export const Filters = /** @__PURE__ */ forwardRef<HTMLDivElement, FiltersProps>(
  function Filters(props, ref) {
    const { asChild, children, className, ...rest } = props;

    return renderPart(
      "div",
      asChild,
      { ...rest, className: cx("mk-filters", className), ref },
      children ?? [
        createElement(FilterPick, { key: "pick" }),
        createElement(FilterTally, { key: "tally" }),
      ],
    );
  },
);

/** Every filter in one select. Drafts are offered only while there are some. */
export function FilterPick(): ReactNode {
  const island = useIsland(PART);
  const { comments, filter, showResolved } = useMaple();
  const drafts = useSavedDrafts();
  const client = useMapleClient();

  const counts = countsFor(comments, showResolved, drafts.length);
  const names = ALL_FILTERS.filter(
    (name) => name !== "drafts" || counts.drafts > 0 || filter === name,
  );
  const onChange = (event: ChangeEvent<HTMLSelectElement>) => {
    client.setFilter(event.currentTarget.value as CommentFilter);
  };

  return renderPart(
    "span",
    false,
    { className: "mk-filter-chip" },
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
      names.map((name) =>
        renderPart(
          "option",
          false,
          { key: name, value: name },
          `${FILTER_LABELS[name]} ${String(counts[name])}`,
        ),
      ),
    ),
  );
}

/** The count per status, as dots in the marks' own colours. Click one to narrow to it. */
export function FilterTally(): ReactNode {
  const { comments, filter, showResolved } = useMaple();
  const drafts = useSavedDrafts();
  const client = useMapleClient();
  const counts = countsFor(comments, showResolved, drafts.length);

  return renderPart(
    "div",
    false,
    { className: "mk-tally" },
    TALLY_ORDER.map((name) =>
      renderPart(
        "button",
        false,
        {
          key: name,
          type: "button",
          className: "mk-tally-one",
          "data-tally": name,
          "data-mk-zero": String(counts[name] === 0),
          "aria-pressed": filter === name,
          "aria-label": tallyLabel(name, counts[name]),
          onClick: () => client.setFilter(filter === name ? "all" : name),
        },
        [
          renderPart("span", false, { key: "dot", className: "mk-dot" }),
          renderPart("span", false, { key: "n", className: "mk-num" }, String(counts[name])),
        ],
      ),
    ),
  );
}

/** The select offers every filter; the tally covers the four with a colour. */
const ALL_FILTERS: readonly CommentFilter[] = [...FILTER_ORDER, "unpinned", "drafts"];
