/**
 * `Maple.Item`: one comment, as a row.
 *
 * A row is scanned, not read: which one, who, when, what they said, and what
 * it is on in the words a reviewer would use. The rung, the confidence, the
 * paths and the reason an anchor lost its place are the panel's — it has the
 * width for the sentence that explains them, and a reader who wants them has
 * already gone there. The leaf is the one on the page, drawn from the same
 * form and the same paint: two drawings of one comment are two comments.
 */

import { kindOf, labelFor } from "@maple-kit/core/anchor";
import { useMapleClient } from "@maple-kit/react";
import { createElement, forwardRef, useCallback, useRef, useState } from "react";

import { cx } from "../cx.js";
import { dataAttributes, formFor } from "../data.js";
import { hoverHandlers } from "../hover.js";
import { PROVENANCE_SENTENCES, STATUS_LABELS, STATUS_SENTENCES } from "../language.js";
import { MapleLeaf } from "../marks/shape.js";
import { renderPart } from "../part.js";
import { composeRefs } from "../slot.js";
import { applyReviewerSlot } from "../slots.js";
import { Tip } from "../tip.js";
import { useIsland } from "./context.js";
import { ISLAND_COPY, kindPhrase } from "./language.js";
import { absoluteTime, relativeTime } from "./time.js";

import type { PartProps } from "../part.js";
import type { Comment, CommentAuthor } from "@maple-kit/core";
import type { ReactNode } from "react";

/** One comment. The row renders it; it takes no view of its own. */
export interface ItemProps extends PartProps {
  readonly comment: Comment;
}

/** Bodies longer than this are clamped, with the rest one click away. */
const LONG_BODY = 150;

const PART = "<Maple.Item>";

/** A second of rest: nobody hovers a timestamp meaning to ask what it was. */
export const TIME_DELAY_MS = 1000;

/** A row: which comment, who and when, what they said, and what it is on. */
export const Item = /** @__PURE__ */ forwardRef<HTMLElement, ItemProps>(function Item(props, ref) {
  const { asChild, className, comment, ...rest } = props;
  const island = useIsland(PART);
  const client = useMapleClient();
  const [expanded, setExpanded] = useState(false);

  const long = comment.body.length > LONG_BODY;
  const number = island.numbers.get(comment.id) ?? 0;
  const selected = island.selected === comment.id;

  return renderPart(
    "article",
    asChild,
    {
      ...dataAttributes({ status: comment.status }),
      ...rest,
      "data-mk-expanded": String(expanded),
      "data-mk-selected": String(selected),
      className: cx("mk-row", className),
      onClick: () => client.viewComment(comment.id),
      ...hoverHandlers(
        () => client.peek(comment.id),
        () => client.peek(null),
      ),
      onFocus: () => client.peek(comment.id),
      onBlur: () => client.peek(null),
      ref: composeRefs<HTMLElement>(ref, useReveal(selected)),
    },
    [
      top(comment, number),
      renderPart("p", false, { key: "body", className: "mk-text mk-body" }, comment.body),
      long ? more(expanded, () => setExpanded(!expanded)) : null,
      meta(comment),
    ],
  );
});

/**
 * A mark clicked selects its row, and a row nobody can see has not been pointed
 * at. `nearest` keeps the scroll in the list and a visible row where it is.
 */
function useReveal(selected: boolean): (node: HTMLElement | null) => void {
  const shown = useRef(false);

  return useCallback(
    (node: HTMLElement | null) => {
      if (!node || !selected) {
        shown.current = shown.current && selected;
        return;
      }
      if (shown.current) return;
      shown.current = true;
      node.scrollIntoView({ block: "nearest", behavior: "smooth" });
    },
    [selected],
  );
}

/** The toggle under a clamped body. Its words say what the next click does. */
function more(expanded: boolean, onClick: () => void): ReactNode {
  const label = expanded ? ISLAND_COPY.showLess : ISLAND_COPY.showAll;
  return renderPart(
    "button",
    false,
    { key: "more", type: "button", className: "mk-more", onClick },
    label,
  );
}

/** Which comment this is, who wrote it, when, and where it is in its life. */
function top(comment: Comment, number: number): ReactNode {
  const chip =
    comment.status === "open"
      ? null
      : createElement(
          Tip,
          {
            key: "status",
            className: cx("mk-chip", chipTone(comment)),
            sentence: STATUS_SENTENCES[comment.status],
          },
          STATUS_LABELS[comment.status],
        );

  return renderPart("div", false, { key: "top", className: "mk-row-top" }, [
    pin(comment, number),
    who(comment),
    chip,
  ]);
}

function chipTone(comment: Comment): string {
  if (comment.status === "resolved") return "mk-chip-ok";
  return comment.status === "orphaned" ? "mk-chip-lost" : "mk-chip-warn";
}

/**
 * The comment's own leaf, at row size: the same address, form and paint as the
 * mark on the page. The fill says where it is in its life, so it says so too.
 */
function pin(comment: Comment, number: number): ReactNode {
  const form = formFor(comment.status);
  const sentence = `${STATUS_LABELS[comment.status]} — ${STATUS_SENTENCES[comment.status]}`;

  return createElement(
    Tip,
    {
      key: "pin",
      className: "mk-rowleaf",
      sentence,
      triggerProps: { ...dataAttributes({ status: comment.status, form }) },
    },
    createElement(MapleLeaf, { key: "leaf", form, halo: false }),
    createElement(
      "span",
      {
        key: "n",
        className: "mk-mark-n mk-num",
        "data-mk-digits": String(String(number).length),
      },
      number,
    ),
  );
}

/** The name and how long ago, both softened when nothing verified the name. */
function who(comment: Comment): ReactNode {
  const { author } = comment;

  return renderPart(
    "span",
    false,
    { key: "who", className: "mk-who", ...dataAttributes({ provenance: author.provenance }) },
    [
      name(author),
      createElement(
        Tip,
        {
          key: "when",
          className: "mk-when",
          delayMs: TIME_DELAY_MS,
          sentence: absoluteTime(comment.createdAt),
        },
        relativeTime(comment.createdAt, Date.now()),
      ),
    ],
  );
}

/**
 * Who wrote it, in their own colour, carrying what that name is worth. A dot
 * rather than a second leaf: the leaf beside it is already the comment's.
 */
function name(author: CommentAuthor): ReactNode {
  const slot = author.colorSlot ?? 0;

  return createElement(
    Tip,
    {
      key: "name",
      className: "mk-name",
      sentence: `${author.name} — ${PROVENANCE_SENTENCES[author.provenance]}`,
      triggerProps: {
        ...dataAttributes({ provenance: author.provenance }),
        ref: (node: HTMLElement | null) => {
          if (node) applyReviewerSlot(node, slot);
        },
      },
    },
    author.name,
  );
}

/** What it is on, and whether a shot came with it. */
function meta(comment: Comment): ReactNode {
  const attachments = comment.attachments?.length ?? 0;

  return renderPart("div", false, { key: "meta", className: "mk-meta" }, [
    comment.status === "orphaned" ? null : place(comment),
    attachments > 0
      ? createElement(
          Tip,
          { key: "shot", className: "mk-chip", sentence: ISLAND_COPY.attachmentSentence },
          ISLAND_COPY.attachment,
        )
      : null,
  ]);
}

function place(comment: Comment): ReactNode {
  const phrase = kindPhrase(kindOf(comment.anchor), labelFor({ anchor: comment.anchor }));
  return renderPart("span", false, { key: "on", className: "mk-when" }, [
    "on ",
    renderPart("b", false, { key: "b" }, phrase),
  ]);
}
