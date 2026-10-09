/**
 * What the island derives from a list of comments, decided once.
 *
 * The number on a row is the comment's place on the branch, oldest first, so it
 * does not move when a new one arrives. The reason an unpinned comment lost its
 * place is not on the wire: it is what the cascade says when the anchor is
 * tried against the page as it is now, which is the only thing that knows.
 */

import { resolveAnchor } from "@maple-kit/core/anchor";
import { matchesFilter } from "@maple-kit/core/client";

import { ORPHAN_ORDER } from "../language.js";
import { UNSENT_COPY } from "./language.js";

import type { Comment, MapleUser } from "@maple-kit/core";
import type { Anchor, OrphanReason, Resolution } from "@maple-kit/core/anchor";
import type { CommentFilter } from "@maple-kit/core/client";
import type { Draft } from "@maple-kit/core/overlay";

/** The count beside one filter's pill. */
export type FilterCounts = Readonly<Record<CommentFilter, number>>;

/** Each comment's place on the branch, oldest first, keyed by id. */
export function numbersFor(comments: readonly Comment[]): ReadonlyMap<string, number> {
  const ordered = [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return new Map(ordered.map((comment, index) => [comment.id, index + 1]));
}

/**
 * The live count beside every pill. `Active` subtracts the resolved ones while
 * they are hidden, because the list under it does too.
 */
export function countsFor(
  comments: readonly Comment[],
  showResolved: boolean,
  drafts = 0,
): FilterCounts {
  const count = (filter: CommentFilter) =>
    comments.filter((comment) => matchesFilter(comment, filter)).length;

  const resolved = count("resolved");
  return {
    all: showResolved ? comments.length : comments.length - resolved,
    open: count("open"),
    needs_reverify: count("needs_reverify"),
    resolved,
    unpinned: count("unpinned"),
    drafts,
  };
}

/**
 * Why this comment has no place on the page, asked of the page itself. An
 * anchor that resolves again has no reason, and the row says nothing.
 */
export function orphanReason(anchor: Anchor, root: ParentNode): OrphanReason | undefined {
  const resolution = resolveAnchor(anchor, { root });
  return resolution.status === "orphaned" ? resolution.reason : undefined;
}

/**
 * What the cascade says about every anchor, in one pass. In default detail
 * only the unpinned are asked: nothing else on the row depends on the answer.
 */
export function resolutionsFor(
  comments: readonly Comment[],
  root: ParentNode,
  developer: boolean,
): ReadonlyMap<string, Resolution> {
  const found = new Map<string, Resolution>();
  for (const comment of comments) {
    if (!developer && comment.status !== "orphaned") continue;
    found.set(comment.id, resolveAnchor(comment.anchor, { root }));
  }
  return found;
}

/**
 * The unpinned tab is a list by reason, not an empty state: the expected case
 * is that some anchors lost their place, and which way they lost it is the
 * thing worth grouping by.
 */
export function byReason(
  comments: readonly Comment[],
  reasonOf: (comment: Comment) => OrphanReason | undefined,
): readonly Comment[] {
  const rank = (comment: Comment) => {
    const reason = reasonOf(comment);
    return reason === undefined ? ORPHAN_ORDER.length : ORPHAN_ORDER.indexOf(reason);
  };
  return [...comments].sort((a, b) => rank(a) - rank(b));
}

/** Where a draft's context falls back to when it never recorded one. */
const NO_CONTEXT = {
  url: "",
  viewportWidth: 0,
  viewportHeight: 0,
  contentWidth: 0,
  devicePixelRatio: 1,
  colorScheme: "light",
} as const;

/**
 * A draft in the shape of a comment, so the row that draws a published one
 * draws it too. It is the reviewer's own, and nothing has verified it yet.
 */
export function draftAsComment(draft: Draft, user: MapleUser | null): Comment {
  return {
    id: draft.id,
    branch: "",
    body: draft.body.trim() === "" ? UNSENT_COPY.blank : draft.body,
    status: "open",
    createdAt: draft.updatedAt,
    author: {
      id: user?.id ?? "draft",
      name: user?.name ?? UNSENT_COPY.you,
      provenance: user === null ? "guest" : "server",
    },
    anchor: draft.anchor,
    context: draft.context ?? NO_CONTEXT,
    ...(draft.attachments === undefined ? {} : { attachments: draft.attachments }),
  };
}
