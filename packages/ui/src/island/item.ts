/**
 * `Maple.Item`: one comment, as a row.
 *
 * Default detail is the default: who, when, what they said, and what it is on
 * in the words a reviewer would use. The rung, the confidence, the source line
 * and the CSS path are developer detail and are absent until it is on. The
 * status chip is drawn only when the status is not open, which is the ordinary
 * case and does not need saying.
 */

import { labelFor } from "@maple-kit/core/anchor";
import { useMapleClient } from "@maple-kit/react";
import { createElement, forwardRef, useState } from "react";

import { confidenceFor, dataAttributes } from "../data.js";
import { TargetIcon } from "../icons/target.js";
import { STATUS_LABELS } from "../language.js";
import { applyReviewerSlot } from "../slots.js";
import { Tip } from "../tip.js";
import { kindOf } from "./comments.js";
import { useIsland } from "./context.js";
import {
  ISLAND_COPY,
  kindPhrase,
  ORPHAN_LABELS,
  orphanTitle,
  PATH_COPY,
  rungLabel,
  rungTitle,
} from "./language.js";
import { Leaf } from "./leaf.js";
import { cx, renderPart } from "./part.js";
import { absoluteTime, relativeTime } from "./time.js";

import type { PartProps } from "./part.js";
import type { Comment, CommentAnchor, CommentAuthor } from "@maple-kit/core";
import type { Orphaned, Resolution, Rung } from "@maple-kit/core/anchor";
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

/** A row: who and when, what they said, and what it is on. */
export const Item = /** @__PURE__ */ forwardRef<HTMLElement, ItemProps>(function Item(props, ref) {
  const { asChild, className, comment, ...rest } = props;
  const island = useIsland(PART);
  const client = useMapleClient();
  const [expanded, setExpanded] = useState(false);

  const long = comment.body.length > LONG_BODY;
  const number = island.numbers.get(comment.id) ?? 0;
  const resolution = island.resolutions.get(comment.id);

  return renderPart(
    "article",
    asChild,
    {
      ...dataAttributes({ status: comment.status }),
      ...rest,
      "data-mk-expanded": String(expanded),
      "data-mk-selected": String(island.selected === comment.id),
      className: cx("mk-row", className),
      onClick: () => client.viewComment(comment.id),
      onPointerEnter: () => client.peek(comment.id),
      onPointerLeave: () => client.peek(null),
      onFocus: () => client.peek(comment.id),
      onBlur: () => client.peek(null),
      ref,
    },
    [
      top(comment, number),
      renderPart("p", false, { key: "body", className: "mk-text mk-body" }, comment.body),
      long ? more(expanded, () => setExpanded(!expanded)) : null,
      meta(comment, { resolution, developer: island.developer }),
    ],
  );
});

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

/** Who wrote it, when, and its place on the branch. */
function top(comment: Comment, number: number): ReactNode {
  const chip =
    comment.status === "open"
      ? null
      : renderPart(
          "span",
          false,
          { key: "status", className: cx("mk-chip", chipTone(comment)) },
          STATUS_LABELS[comment.status],
        );

  return renderPart("div", false, { key: "top", className: "mk-row-top" }, [
    who(comment),
    chip,
    renderPart("span", false, { key: "n", className: "mk-index" }, `#${String(number)}`),
  ]);
}

function chipTone(comment: Comment): string {
  if (comment.status === "resolved") return "mk-chip-ok";
  return comment.status === "orphaned" ? "mk-chip-lost" : "mk-chip-warn";
}

/** The avatar, the name and how long ago, all softened when unverified. */
function who(comment: Comment): ReactNode {
  const { author } = comment;

  return renderPart(
    "span",
    false,
    { key: "who", className: "mk-who", ...dataAttributes({ provenance: author.provenance }) },
    [
      avatar(author),
      renderPart("span", false, { key: "name", className: "mk-name" }, author.name),
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

/** The leaf, in the reviewer's own colour, with their initials over it. */
function avatar(author: CommentAuthor): ReactNode {
  const slot = author.colorSlot ?? 0;

  return renderPart(
    "span",
    false,
    {
      key: "avatar",
      className: "mk-avatar",
      ...dataAttributes({ provenance: author.provenance }),
      title: avatarTitle(author),
      ref: (node: HTMLElement | null) => {
        if (node) applyReviewerSlot(node, slot);
      },
    },
    [
      renderPart(Leaf, false, { key: "leaf", size: 21 }),
      renderPart("span", false, { key: "ini", className: "mk-initials" }, initials(author.name)),
    ],
  );
}

/** How much the identity is worth, in a sentence rather than a warning. */
function avatarTitle(author: CommentAuthor): string {
  const { name } = author;
  if (author.provenance === "server") return `${name} — verified by the application's own session`;
  if (author.provenance === "client") return `${name} — the application told us; unverified`;
  return `${name} — typed a name into Maple`;
}

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((word) => word.charAt(0));
  return letters.join("").toUpperCase() || "?";
}

/** How much of the anchor's story the row is allowed to tell. */
interface Detail {
  readonly resolution: Resolution | undefined;
  readonly developer: boolean;
}

/** What it is on, or why it has nowhere to be, and whether a shot came with it. */
function meta(comment: Comment, detail: Detail): ReactNode {
  const attachments = comment.attachments?.length ?? 0;
  const { developer, resolution } = detail;

  return renderPart("div", false, { key: "meta", className: "mk-meta" }, [
    resolution?.status === "orphaned" ? lost(resolution, developer) : place(comment),
    ...(developer ? technical(comment.anchor, resolution) : []),
    attachments > 0
      ? renderPart("span", false, { key: "shot", className: "mk-chip" }, ISLAND_COPY.attachment)
      : null,
  ]);
}

/**
 * The rung, the confidence and the two paths — each a chip carrying a value
 * and a tooltip carrying the sentence, because a row is scanned, not read.
 */
function technical(anchor: CommentAnchor, resolution: Resolution | undefined): ReactNode[] {
  const chips: ReactNode[] = [];
  if (resolution?.status === "resolved") chips.push(rung(resolution.by, resolution.confidence));
  if (anchor.source !== undefined) chips.push(path("source", anchor.source));
  if (anchor.selector !== undefined) chips.push(path("selector", anchor.selector));
  return chips;
}

/** The crosshair and the percentage. The sentence says what the number buys. */
function rung(by: Rung, confidence: number): ReactNode {
  return createElement(
    Tip,
    {
      key: "rung",
      className: "mk-chip-dev mk-num",
      sentence: rungTitle(by, confidenceFor(confidence)),
    },
    createElement(TargetIcon, { key: "icon", size: 11 }),
    rungLabel(Math.round(confidence * 100)),
  );
}

/** A path the cascade recorded, ellipsised: it is a value, not a field name. */
function path(kind: "selector" | "source", value: string): ReactNode {
  const copy = PATH_COPY[kind];
  return createElement(
    Tip,
    { key: kind, className: "mk-chip-dev", sentence: `${copy.sentence} ${value}` },
    createElement("span", { key: "v", className: "mk-path" }, value),
  );
}

function place(comment: Comment): ReactNode {
  const phrase = kindPhrase(kindOf(comment.anchor), labelFor({ anchor: comment.anchor }));
  return renderPart("span", false, { key: "on", className: "mk-when" }, [
    "on ",
    renderPart("b", false, { key: "b" }, phrase),
  ]);
}

/** Two words on the chip; the sentence, and the rungs tried, in the tooltip. */
function lost(resolution: Orphaned, developer: boolean): ReactNode {
  const { reason, tried } = resolution;
  return createElement(
    Tip,
    {
      key: "lost",
      className: "mk-chip-lost",
      sentence: orphanTitle(reason, developer ? tried : []),
    },
    ORPHAN_LABELS[reason],
  );
}
