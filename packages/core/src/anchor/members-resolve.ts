/**
 * Placing a region again from the elements it covered.
 *
 * Each member is found through the ordinary cascade, so every check that
 * cascade makes applies to it. The rectangle is then each found member grown
 * by the offsets recorded around it. On an unchanged page those grown boxes are
 * all the drawn rectangle; when they disagree the members have moved apart, and
 * the union is drawn with less confidence rather than a position being invented.
 */

import { matchQuote } from "../lib/match-quote.js";

import type { RegionMember } from "../types.js";
import type { RegionBox } from "./region.js";
import type { ResolveOptions } from "./resolve.js";
import type { PlacedMember, Resolution, Resolved } from "./types.js";

/** Confidence a partly found or spread-out region is held under. Reads as weak. */
export const LOW_CONFIDENCE = 0.6;

/** Score the element's own text must reach when only a selector placed the member. */
const SELECTOR_TEXT_SCORE = 0.8;

/** Pixels the grown boxes may disagree by before the members count as moved apart. */
const SPREAD_TOLERANCE = 16;

/** The cascade, passed in because it is the thing that calls this. */
export type Resolver = (anchor: RegionMember["anchor"], options: ResolveOptions) => Resolution;

/**
 * The region placed by whichever members the page still has, or nothing when it
 * has none of them, which is the caller's cue to use the container instead.
 */
export function resolveMembers(
  members: readonly RegionMember[],
  options: ResolveOptions,
  resolve: Resolver,
): Resolved | undefined {
  const found: { placed: PlacedMember; resolved: Resolved }[] = [];
  const scope = { ...options, passage: false };

  for (const member of members) {
    const resolved = resolve(member.anchor, scope);
    if (resolved.status === "resolved" && confirmed(resolved, member)) {
      found.push({ placed: { element: resolved.element, offset: member.offset }, resolved });
    }
  }

  const first = found[0];
  if (!first) return undefined;

  const placed = found.map((one) => one.placed);
  return {
    status: "resolved",
    element: holding(placed.map((one) => one.element)),
    by: first.resolved.by,
    confidence: confidenceOf(
      found.map((one) => one.resolved),
      members.length,
      placed,
    ),
    members: placed,
  };
}

/**
 * A selector alone is a position among siblings, and a removed sibling moves
 * the next one into it. The member is only accepted there if its words are.
 */
function confirmed(resolved: Resolved, member: RegionMember): boolean {
  const exact = member.anchor.quote?.exact;
  if (resolved.by !== "selector" || !exact) return true;

  const hit = matchQuote(resolved.element.textContent ?? "", exact);
  return hit !== undefined && hit.score >= SELECTOR_TEXT_SCORE;
}

/** The rectangle as the page has it now: the union of the members, each grown by its offsets. */
export function membersBox(members: readonly PlacedMember[]): RegionBox {
  return union(members.map(grown));
}

/** Found over recorded, times how sure the rungs were, and held low if it looks off. */
function confidenceOf(
  found: readonly Resolved[],
  recorded: number,
  placed: readonly PlacedMember[],
): number {
  const mean = found.reduce((sum, one) => sum + one.confidence, 0) / found.length;
  const share = (found.length / recorded) * mean;
  const doubtful = found.length < recorded || spread(placed);
  return doubtful ? Math.min(share, LOW_CONFIDENCE) : share;
}

/** True when the grown boxes no longer agree on where the rectangle is. */
function spread(placed: readonly PlacedMember[]): boolean {
  if (placed.length < 2) return false;

  const boxes = placed.map(grown);
  const all = union(boxes);
  return boxes.some(
    (box) =>
      Math.abs(box.x - all.x) > SPREAD_TOLERANCE ||
      Math.abs(box.y - all.y) > SPREAD_TOLERANCE ||
      Math.abs(box.x + box.width - (all.x + all.width)) > SPREAD_TOLERANCE ||
      Math.abs(box.y + box.height - (all.y + all.height)) > SPREAD_TOLERANCE,
  );
}

function grown({ element, offset }: PlacedMember): RegionBox {
  const box = element.getBoundingClientRect();
  return {
    x: box.x - offset.left,
    y: box.y - offset.top,
    width: box.width + offset.left + offset.right,
    height: box.height + offset.top + offset.bottom,
  };
}

function union(boxes: readonly RegionBox[]): RegionBox {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The nearest element that holds all of these, or the first when nothing does. */
function holding(elements: readonly Element[]): Element {
  const first = elements[0]!;
  for (let node: Element | null = first; node; node = node.parentElement) {
    if (elements.every((element) => node.contains(element))) return node;
  }
  return first;
}
