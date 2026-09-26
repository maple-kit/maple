/**
 * The page's text as one string, with a map back to the nodes it came from.
 *
 * The quote rung searches a flat string, then has to turn the offsets it finds
 * back into a DOM range. Building both together is the only way the two stay
 * consistent while the page is live.
 */

/** A run of the flat text and the node it came from. */
interface Segment {
  readonly node: Text;
  readonly start: number;
  readonly end: number;
}

/** The flat text of a subtree and where each part of it lives. */
export interface TextIndex {
  readonly text: string;
  readonly segments: readonly Segment[];
}

const SKIPPED = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "IFRAME"]);

/** Marks a subtree as Maple's own, so the overlay never anchors to itself. */
export const OVERLAY_MARKER = "data-maple-overlay";

/**
 * Collects the text of a subtree. Script, style and hidden content is left out,
 * as is Maple's own overlay, because none of it is text a reviewer can see.
 */
export function indexText(root: Node): TextIndex {
  const segments: Segment[] = [];
  let text = "";

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      isVisible(node.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
  });

  let current = walker.nextNode();
  while (current) {
    const node = current as Text;
    const { length } = node.data;
    if (length > 0) {
      segments.push({ node, start: text.length, end: text.length + length });
      text += node.data;
    }
    current = walker.nextNode();
  }

  return { text, segments };
}

/**
 * The range covering `[start, end)` of the flat text, or undefined when the
 * offsets fall outside it.
 */
export function rangeAt(index: TextIndex, start: number, end: number): Range | undefined {
  const from = locate(index, start, false);
  const to = locate(index, end, true);
  if (!from || !to) return undefined;

  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  return range;
}

/** A stretch of the flat text, as `[start, end)`. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/** Where an element's own text sits in the flat text, when it has any. */
export function spanOf(index: TextIndex, element: Element): Span | undefined {
  const inside = index.segments.filter((segment) => element.contains(segment.node));
  const first = inside[0];
  const last = inside[inside.length - 1];
  return first && last ? { start: first.start, end: last.end } : undefined;
}

/** The offset in the flat text of a position in the DOM, when it is in it. */
export function positionOf(index: TextIndex, node: Text, offset: number): number | undefined {
  const segment = index.segments.find((candidate) => candidate.node === node);
  return segment ? segment.start + Math.min(offset, segment.end - segment.start) : undefined;
}

interface Point {
  readonly node: Text;
  readonly offset: number;
}

/**
 * A boundary between two text nodes belongs to the node after it for a start
 * and the one before it for an end, or the range covers a node it should not.
 */
function locate(index: TextIndex, position: number, atEnd: boolean): Point | undefined {
  for (const segment of index.segments) {
    const inside = atEnd
      ? position > segment.start && position <= segment.end
      : position >= segment.start && position < segment.end;
    if (inside) return { node: segment.node, offset: position - segment.start };
  }
  return edge(index, position);
}

/** An empty range at either extreme still has to land on a node. */
function edge(index: TextIndex, position: number): Point | undefined {
  const first = index.segments[0];
  const last = index.segments[index.segments.length - 1];
  if (!first || !last) return undefined;
  if (position <= first.start) return { node: first.node, offset: 0 };
  if (position >= last.end) return { node: last.node, offset: last.end - last.start };
  return undefined;
}

function isVisible(element: Element | null): boolean {
  for (let current = element; current; current = current.parentElement) {
    if (SKIPPED.has(current.tagName)) return false;
    if (current.hasAttribute(OVERLAY_MARKER)) return false;
    if (current.hasAttribute("hidden") || current.getAttribute("aria-hidden") === "true") {
      return false;
    }
  }
  return true;
}
