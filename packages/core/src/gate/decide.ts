/**
 * Whether a review surface is clear to merge, decided from the comments alone.
 *
 * The decision is vendor-agnostic and the publication is not: a check run, an
 * external status check and a build status are three different APIs over this
 * one verdict. Keeping them apart is what keeps the check-run API out of core.
 */

import type { Comment, CommentStatus, GateVerdict } from "../types.js";

/** Statuses that hold the gate. Everything but `resolved`, by default. */
export const BLOCKING_STATUSES: readonly CommentStatus[] = ["open", "needs_reverify", "orphaned"];

/** How the verdict is reached. */
export interface GateOptions {
  /**
   * Which statuses hold the gate. Defaults to {@link BLOCKING_STATUSES}:
   * a comment nobody resolved is a comment nobody addressed.
   */
  readonly blockOn?: readonly CommentStatus[];
  /**
   * False when Maple is not reviewing this surface at all: a fork, a bot's
   * bump, a branch with no preview. Neither `unreadable` nor `no-comments`.
   */
  readonly hasReview?: boolean;
  /**
   * False when the store cannot record status, so nothing it reports can be
   * trusted to mean resolved. The verdict is then `neutral`, never `clear`.
   */
  readonly statusTracked?: boolean;
}

/** How many comments a summary lists before it stops naming them. */
const LISTED = 10;

/**
 * Decides the verdict for one surface. `comments` is undefined when the store
 * could not be read at all; `hasReview: false` is a surface Maple was never
 * reviewing. Both are neutral, and each says which one it is.
 */
export function decideGate(
  comments: readonly Comment[] | undefined,
  options: GateOptions = {},
): GateVerdict {
  if (options.hasReview === false) {
    return neutral(
      "no-review",
      "No visual review on this pull request",
      "Maple is not reviewing this pull request, so this check has nothing to hold it on.",
    );
  }
  if (comments === undefined) {
    return neutral("unreadable", NOT_CHECKED, `Maple could not read the comments${NO_ANSWER}`);
  }
  if (options.statusTracked === false) {
    return neutral(
      "status-untracked",
      NOT_CHECKED,
      `This store cannot record whether a comment was resolved${NO_ANSWER}`,
    );
  }

  const blockOn = options.blockOn ?? BLOCKING_STATUSES;
  const blocking = comments.filter((comment) => blockOn.includes(comment.status));
  const counts = { open: blocking.length, total: comments.length };

  if (comments.length === 0) return { ...counts, conclusion: "clear", ...cleared("no-comments") };
  if (blocking.length === 0) return { ...counts, conclusion: "clear", ...cleared("all-resolved") };

  return {
    ...counts,
    conclusion: "blocked",
    reason: "comments-open",
    title: `${String(blocking.length)} of ${String(comments.length)} ${plural(comments.length)} still open`,
    summary: listing(comments, blocking),
  };
}

function cleared(
  reason: "all-resolved" | "no-comments",
): Pick<GateVerdict, "reason" | "title" | "summary"> {
  const title =
    reason === "no-comments" ? "No visual review comments" : "Every comment is resolved";
  const summary =
    reason === "no-comments"
      ? "Nobody has left a visual review comment on this pull request."
      : "Every visual review comment on this pull request has been resolved.";

  return { reason, title, summary };
}

/** The title the two "I cannot tell" neutrals share, and the way both end. */
const NOT_CHECKED = "Visual review was not checked";
const NO_ANSWER = ", so this check has nothing to say about them.";

/** A gate with nothing it can judge must not block, and must say which nothing. */
function neutral(reason: GateVerdict["reason"], title: string, summary: string): GateVerdict {
  return { conclusion: "neutral", reason, open: 0, total: 0, title, summary };
}

/**
 * The open comments, numbered as the pull-request table numbers them, so a
 * reviewer moving between the check and the table never translates.
 */
function listing(comments: readonly Comment[], blocking: readonly Comment[]): string {
  const lines = blocking
    .slice(0, LISTED)
    .map((comment) => `${String(comments.indexOf(comment) + 1)}. ${entry(comment)}`);

  const rest = blocking.length - lines.length;
  if (rest > 0) lines.push(`…and ${String(rest)} more.`);

  return ["These comments are still open:", "", ...lines].join("\n");
}

function entry(comment: Comment): string {
  const anchor = comment.anchor.component ?? comment.anchor.source ?? comment.anchor.selector;
  const where = anchor === undefined ? "" : `\`${anchor}\` — `;

  return `${where}${oneLine(comment.body)}${note(comment.status)}`;
}

/** Why a comment nobody reopened is nonetheless still holding the gate. */
function note(status: CommentStatus): string {
  if (status === "orphaned") return " _(unpinned)_";
  return status === "needs_reverify" ? " _(needs re-checking after a new commit)_" : "";
}

/** A markdown list item ends at a newline, so a multi-line body becomes one. */
function oneLine(body: string): string {
  return body.replaceAll(/\s+/g, " ").trim();
}

function plural(count: number): string {
  return count === 1 ? "comment" : "comments";
}
