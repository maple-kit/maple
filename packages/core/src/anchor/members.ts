/**
 * The elements a rectangle covers, recorded so the rectangle can follow them.
 *
 * A rectangle measured as fractions of a container is only as steady as that
 * container, and a container that is the whole page moves whenever the page
 * reflows. What a reviewer drew over is a card and its heading, so those are
 * what get anchored; the container stays behind as the last resort.
 */

import { KEY_ATTRIBUTE, NAME_ATTRIBUTE, SOURCE_ATTRIBUTE } from "../tagger/attributes.js";
import { describeElement } from "./describe.js";
import { OVERLAY_MARKER } from "./text-position.js";

import type { MemberAnchor, MemberOffset, RegionMember } from "../types.js";
import type { RegionBox } from "./region.js";

/** How the members are found. */
export interface CaptureOptions {
  /** Subtree searched and described against. Defaults to the document. */
  readonly root?: ParentNode;
}

/** Share of an element that must be inside the rectangle: an edge-clipped card is not the subject. */
export const MINIMUM_OVERLAP = 0.6;

/** More than this and the payload grows for a region that is really the whole area. */
export const MAXIMUM_MEMBERS = 4;

/** A member's quote is only a way back to it, so it need not carry a paragraph. */
const MAXIMUM_QUOTE = 120;

/** Shortest text worth finding an untagged element by. */
const MINIMUM_TEXT = 3;

const TAGS = [KEY_ATTRIBUTE, SOURCE_ATTRIBUTE, NAME_ATTRIBUTE];

interface Candidate {
  readonly element: Element;
  readonly box: RegionBox;
  readonly tagged: boolean;
  /** Area of the element inside the rectangle, which is what ranks it. */
  readonly area: number;
}

/**
 * The members of a rectangle, best first, or none when nothing qualifies — a
 * rectangle over a gap, or over a whole list, is honestly about its container.
 */
export function captureMembers(rect: RegionBox, options: CaptureOptions = {}): RegionMember[] {
  const root = options.root ?? document;
  const members: RegionMember[] = [];

  for (const candidate of rank(prune(covered(root, rect)))) {
    const member = memberOf(candidate, rect, root);
    if (member) members.push(member);
    if (members.length === MAXIMUM_MEMBERS) break;
  }
  return members;
}

/** Elements that are mostly inside the rectangle and can be found again. */
function covered(root: ParentNode, rect: RegionBox): Candidate[] {
  const found: Candidate[] = [];

  for (const element of root.querySelectorAll("*")) {
    const box = element.getBoundingClientRect();
    const total = box.width * box.height;
    const area = intersection(box, rect);
    if (total <= 0 || area / total < MINIMUM_OVERLAP) continue;
    if (element.closest(`[${OVERLAY_MARKER}]`)) continue;

    const tagged = TAGS.some((name) => element.hasAttribute(name));
    if (tagged || speaks(element)) found.push({ element, box, tagged, area });
  }
  return found;
}

/**
 * Tagged elements holding another tagged one are dropped, leaving the parts and
 * not the shell. An untagged one stands only where no tagged member covers it.
 */
function prune(found: readonly Candidate[]): Candidate[] {
  const tagged = found.filter((one) => one.tagged);
  const untagged = found.filter((one) => !one.tagged);

  const leaves = tagged.filter((one) => !holdsAnother(one, tagged));
  const outside = untagged.filter((one) => {
    const inside = leaves.some((leaf) => leaf.element.contains(one.element));
    return !inside && !holdsAnother(one, untagged);
  });
  return [...leaves, ...outside];
}

function holdsAnother(one: Candidate, among: readonly Candidate[]): boolean {
  return among.some((other) => other !== one && one.element.contains(other.element));
}

/** Tagged before untagged, and the most covered first within each. */
function rank(found: readonly Candidate[]): Candidate[] {
  return [...found].sort((a, b) => Number(b.tagged) - Number(a.tagged) || b.area - a.area);
}

function memberOf(
  candidate: Candidate,
  rect: RegionBox,
  root: ParentNode,
): RegionMember | undefined {
  const anchor = anchorOf(candidate, root);
  if (!anchor) return undefined;

  const { box } = candidate;
  return {
    anchor,
    offset: offsetOf(box, rect),
    overlap: round(candidate.area / (box.width * box.height)),
  };
}

/**
 * An untagged element keeps only quote and selector, since inherited tags would
 * resolve it to its ancestor, and is not recorded without both.
 */
function anchorOf(candidate: Candidate, root: ParentNode): MemberAnchor | undefined {
  const described = describeElement(candidate.element, { root, maximumQuote: MAXIMUM_QUOTE });
  if (candidate.tagged) return described;

  const { quote, selector } = described;
  return quote && selector ? { quote, selector } : undefined;
}

/** Positive where the rectangle reaches past the element, negative where it cuts in. */
function offsetOf(box: RegionBox, rect: RegionBox): MemberOffset {
  return {
    top: round(box.y - rect.y, 10),
    left: round(box.x - rect.x, 10),
    right: round(rect.x + rect.width - (box.x + box.width), 10),
    bottom: round(rect.y + rect.height - (box.y + box.height), 10),
  };
}

/** True for an element with words of its own, not only words inherited from children. */
function speaks(element: Element): boolean {
  const own = [...element.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join("")
    .trim();
  return own.length >= MINIMUM_TEXT;
}

function intersection(a: RegionBox, b: RegionBox): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

function round(value: number, scale = 1000): number {
  return Math.round(value * scale) / scale;
}
