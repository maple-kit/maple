/**
 * Which comments the inventory shows, and the one number on the pill.
 *
 * Pure functions over a list, so the rule that a resolved comment is hidden
 * until asked for is one place a test can read rather than a condition spread
 * across a list, a count and a mark.
 */

import type { Comment } from "../types.js";
import type { CommentFilter } from "./types.js";

/** The wire status each filter narrows to. `all` narrows to nothing. */
const STATUS_FOR: Partial<Record<CommentFilter, Comment["status"]>> = {
  needs_reverify: "needs_reverify",
  open: "open",
  resolved: "resolved",
  unpinned: "orphaned",
};

/** True when `filter` would show `comment`, ignoring the resolved setting. */
export function matchesFilter(comment: Comment, filter: CommentFilter): boolean {
  if (filter === "drafts") return false;
  const status = STATUS_FOR[filter];
  return status === undefined || comment.status === status;
}

/**
 * The comments to render. Resolved ones are hidden under every filter but
 * `resolved` itself until the setting is on, which is the one click that
 * brings them back everywhere.
 */
export function visibleComments(
  comments: readonly Comment[],
  filter: CommentFilter,
  showResolved: boolean,
): readonly Comment[] {
  const hide = !showResolved && filter !== "resolved";
  return comments.filter(
    (comment) => matchesFilter(comment, filter) && !(hide && comment.status === "resolved"),
  );
}

/**
 * The pill's count: everything not resolved, unpinned included. It is not
 * split into "open · lost", because two numbers on a pill are read as one.
 */
export function openCount(comments: readonly Comment[]): number {
  return comments.filter((comment) => comment.status !== "resolved").length;
}
