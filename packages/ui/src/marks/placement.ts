/**
 * Which comments have a place on the page, and what number each one carries.
 *
 * An unpinned comment is left out rather than snapped to the nearest ancestor:
 * a comment silently attached to the wrong element looks answered, which is
 * worse than one that admits it is lost. The only way back to it is the
 * island's Unpinned filter, which is why that filter exists.
 */

import { kindOf, resolveAnchor } from "@maple-kit/core/anchor";

import type { Comment } from "@maple-kit/core";
import type { Anchor, AnchorRegion } from "@maple-kit/core/anchor";
import type { Draft } from "@maple-kit/core/overlay";

/** Where on the page something is, whether it was published or not. */
export interface Located {
  readonly element: Element;
  /** The passage itself, when a text rung placed it. */
  readonly range?: Range;
  /** The rectangle, when the comment is on a region rather than an element. */
  readonly region?: AnchorRegion;
  readonly confidence: number;
}

/** A comment the page still has somewhere to put. */
export interface Placement extends Located {
  readonly comment: Comment;
  /** The address: its place in the branch's own order, counted from one. */
  readonly address: number;
}

/** A draft the page still has somewhere to put. No address until it is sent. */
export interface DraftPlacement extends Located {
  readonly draft: Draft;
}

/** The address of every comment, which the list and the export share. */
export function addresses(comments: readonly Comment[]): ReadonlyMap<string, number> {
  return new Map(comments.map((comment, index) => [comment.id, index + 1]));
}

/**
 * Everything drawable, in the order it was given, with nothing guessed. A text
 * anchor is narrowed to its passage, so the ring a mark draws highlights the
 * words the comment is on rather than the paragraph they sit in.
 */
export function placements(
  comments: readonly Comment[],
  address: ReadonlyMap<string, number>,
  root: ParentNode,
): readonly Placement[] {
  const placed: Placement[] = [];

  for (const comment of comments) {
    if (comment.status === "orphaned") continue;
    const found = locate(comment.anchor, root);
    if (found) placed.push({ ...found, comment, address: address.get(comment.id) ?? 0 });
  }

  return placed;
}

/** Every unsent comment the page still has, placed by the same rules. */
export function draftPlacements(
  drafts: readonly Draft[],
  root: ParentNode,
): readonly DraftPlacement[] {
  return drafts.flatMap((draft) => {
    const found = locate(draft.anchor, root);
    return found ? [{ ...found, draft }] : [];
  });
}

/** One anchor on the page, or nothing when the page no longer has it. */
function locate(anchor: Anchor, root: ParentNode): Located | undefined {
  const passage = kindOf(anchor) === "text";
  const found = resolveAnchor(anchor, { root, passage });
  if (found.status !== "resolved") return undefined;

  return {
    element: found.element,
    ...(found.range === undefined ? {} : { range: found.range }),
    ...(anchor.region === undefined ? {} : { region: anchor.region }),
    confidence: found.confidence,
  };
}
