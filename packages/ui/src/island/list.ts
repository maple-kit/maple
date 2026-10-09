/**
 * `Maple.List`: the rows under whatever filter is on.
 *
 * The rows are what a filter swaps; the card around them is not rebuilt. Under
 * the unpinned tab they are ordered by the reason they lost their place, which
 * is the thing worth grouping by once losing one is the expected case.
 */

import { useComments, useMaple, useMapleClient } from "@maple-kit/react";
import { createElement, forwardRef, Fragment, useEffect } from "react";

import { cx } from "../cx.js";
import { isSetupGap } from "../notice/language.js";
import { renderPart } from "../part.js";
import { byReason, draftAsComment } from "./comments.js";
import { listId, reasonOf, useIsland } from "./context.js";
import { LoadFailed } from "./empty.js";
import { FILTER_LABELS, ISLAND_COPY, UNSENT_COPY } from "./language.js";

import type { PartProps } from "../part.js";
import type { Comment } from "@maple-kit/core";
import type { ClientState } from "@maple-kit/core/client";
import type { MouseEvent, ReactElement, ReactNode } from "react";

/** The list, and how one comment is rendered into a row. */
export interface ListProps extends PartProps {
  /** Called for each comment the filter shows, in render order. */
  readonly children?: (comment: Comment) => ReactNode;
}

const PART = "<Maple.List>";

/** Every comment under the current filter, or the one line that says there are none. */
export const List = /** @__PURE__ */ forwardRef<HTMLDivElement, ListProps>(
  function List(props, ref) {
    const { asChild, children, className, ...rest } = props;
    const island = useIsland(PART);
    const { drafts, error, filter, github, phase, user } = useMaple();
    const client = useMapleClient();
    const comments = useComments();
    const inDrafts = filter === "drafts";

    // Publishing the last draft leaves the filter with nothing to show.
    useEffect(() => {
      if (inDrafts && drafts.length === 0) client.setFilter("all");
    }, [client, drafts.length, inDrafts]);
    const failed = error?.during === "load" && !isSetupGap(error.kind, github);

    let rows: readonly Comment[] = comments;
    if (inDrafts) rows = drafts.map((draft) => draftAsComment(draft, user));
    else if (filter === "unpinned") {
      rows = byReason(comments, (comment) => reasonOf(island.resolutions, comment.id));
    }
    const row = (comment: Comment) => {
      const item = children?.(comment);
      return inDrafts ? createElement(DraftRow, { id: comment.id }, item) : item;
    };
    const body =
      rows.length === 0
        ? empty(phase, failed)
        : rows.map((comment) => createElement(Fragment, { key: comment.id }, row(comment)));

    return renderPart(
      "div",
      asChild,
      {
        role: "tabpanel",
        ...rest,
        id: listId(island.contentId),
        "aria-label": FILTER_LABELS[filter],
        className: cx("mk-list", className),
        ref,
      },
      body,
    );
  },
);

/** An empty list has three reasons and they are not one sentence: a load that
 * failed read as a branch with nothing on it, which stops a reviewer looking.
 * A deployment with no store failed nothing: the notice explains it. */
function empty(phase: ClientState["phase"], failed: boolean): ReactElement {
  if (failed) return createElement(LoadFailed);
  const said = phase === "loading" ? ISLAND_COPY.loading : ISLAND_COPY.empty;
  return createElement("p", { className: "mk-empty" }, said);
}

/**
 * A draft is a row like any other, but a click on it picks the draft back up
 * rather than looking at a comment, and it can be thrown away from the row.
 */
function DraftRow(props: { readonly id: string; readonly children?: ReactNode }): ReactNode {
  const client = useMapleClient();

  return createElement(
    "div",
    {
      className: "mk-draft-row",
      onClickCapture: (event: MouseEvent<HTMLElement>) => {
        event.stopPropagation();
        const drop = (event.target as Element).closest(".mk-draft-drop");
        if (drop) client.discardDraft(props.id);
        else client.resumeDraft(props.id);
      },
    },
    props.children,
    createElement(
      "button",
      {
        type: "button",
        className: "mk-draft-drop",
        "aria-label": UNSENT_COPY.discard,
        title: UNSENT_COPY.discard,
      },
      UNSENT_COPY.discardGlyph,
    ),
  );
}
