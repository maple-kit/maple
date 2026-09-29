/**
 * The page's text as one string, with a map back to the nodes it came from.
 *
 * The quote rung searches a flat string, then has to turn the offsets it finds
 * back into a DOM range. Building both together is the only way the two stay
 * consistent while the page is live.
 */

/**
 * A run of the flat text and its node. `kept` maps each character of the run to
 * one of the node's, and is left out when the run is the node's data.
 */
interface Segment {
  readonly node: Text;
  readonly start: number;
  readonly end: number;
  readonly kept?: readonly number[];
}

/** The flat text of a subtree and where each part of it lives. */
export interface TextIndex {
  readonly text: string;
  readonly segments: readonly Segment[];
}

/**
 * Text from two of these is never read as one word. A separator is put
 * between them in the flat text and belongs to no node.
 */
const BLOCKS =
  "address, article, aside, blockquote, dd, details, div, dl, dt, fieldset, figcaption, figure, footer, form, h1, h2, h3, h4, h5, h6, header, hr, li, main, nav, ol, p, pre, section, summary, table, td, th, tr, ul";

const SEPARATOR = " ";
const WHITESPACE = /[ \t\n\r\f]/;
const NEEDS_COLLAPSING = /[\t\n\r\f]| {2}/;

const SKIPPED = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "IFRAME"]);

/** Marks a subtree as Maple's own, so the overlay never anchors to itself. */
export const OVERLAY_MARKER = "data-maple-overlay";

/**
 * Collects the text of a subtree. Script, style and hidden content is left out,
 * as is Maple's own overlay, because none of it is text a reviewer can see.
 * Block-level text is joined with a space and whitespace runs are collapsed, so
 * the text reads as it is shown and survives a reflow.
 */
export function indexText(root: Node): TextIndex {
  const segments: Segment[] = [];
  const builder = { text: "", breakBefore: false, block: undefined as Element | null | undefined };
  const start = root instanceof Element ? root : root.parentElement;
  if (start && !isVisible(start)) return { text: "", segments };

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) => {
      if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
      if (isHidden(node as Element)) return NodeFilter.FILTER_REJECT;
      return (node as Element).tagName === "BR" ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });

  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    if (current.nodeType !== Node.TEXT_NODE) builder.breakBefore = true;
    else append(builder, current as Text, segments);
  }
  return { text: builder.text, segments };
}

interface Builder {
  text: string;
  /** A `<br>` since the last text, which separates like a block boundary does. */
  breakBefore: boolean;
  /** The block the last text sat in, or null for none, or undefined before any. */
  block: Element | null | undefined;
}

function append(builder: Builder, node: Text, segments: Segment[]): void {
  const before = builder.text.length;
  const block = node.parentElement?.closest(BLOCKS) ?? null;
  const separate = builder.breakBefore || (builder.block !== undefined && builder.block !== block);
  const tail = builder.text.charAt(before - 1);
  const gap = separate && before > 0 && tail !== SEPARATOR;

  const run = collapse(node.data, gap ? SEPARATOR : tail);
  if (run.text.length === 0) return;

  const start = before + (gap ? SEPARATOR.length : 0);
  builder.text += (gap ? SEPARATOR : "") + run.text;
  segments.push({
    node,
    start,
    end: start + run.text.length,
    ...(run.kept ? { kept: run.kept } : {}),
  });
  builder.block = block;
  builder.breakBefore = false;
}

interface Run {
  readonly text: string;
  readonly kept?: readonly number[];
}

/** One space for each run of whitespace, and none where the text so far ends in one. */
function collapse(data: string, tail: string): Run {
  const open = tail === SEPARATOR || tail === "";
  if (!NEEDS_COLLAPSING.test(data) && !(open && WHITESPACE.test(data.charAt(0)))) {
    return { text: data };
  }

  let text = "";
  let last = tail;
  const kept: number[] = [];
  for (let index = 0; index < data.length; index++) {
    const space = WHITESPACE.test(data.charAt(index));
    if (space && (last === SEPARATOR || last === "")) continue;
    last = space ? SEPARATOR : data.charAt(index);
    text += last;
    kept.push(index);
  }
  return { text, kept };
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
  if (!segment) return undefined;
  if (!segment.kept) return segment.start + Math.min(offset, segment.end - segment.start);

  const position = segment.kept.findIndex((source) => source >= offset);
  return segment.start + (position === -1 ? segment.kept.length : position);
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
  const segments = index.segments;
  const segment = atEnd
    ? segments.findLast((candidate) => candidate.start < position)
    : segments.find((candidate) => candidate.end > position);
  if (!segment) return edge(index, position);

  const inside = Math.min(Math.max(position - segment.start, 0), segment.end - segment.start);
  return { node: segment.node, offset: dataOffset(segment, inside, atEnd) };
}

/** Where `inside` characters into a run is in the node's own data. */
function dataOffset(segment: Segment, inside: number, atEnd: boolean): number {
  const { kept } = segment;
  if (!kept) return inside;
  if (atEnd) return inside === 0 ? 0 : kept[inside - 1]! + 1;
  return inside >= kept.length ? segment.node.data.length : kept[inside]!;
}

/** An empty range at either extreme still has to land on a node. */
function edge(index: TextIndex, position: number): Point | undefined {
  const first = index.segments[0];
  const last = index.segments[index.segments.length - 1];
  if (!first || !last) return undefined;
  if (position <= first.start) return { node: first.node, offset: 0 };
  if (position >= last.end) return { node: last.node, offset: last.node.data.length };
  return undefined;
}

function isVisible(element: Element | null): boolean {
  for (let current = element; current; current = current.parentElement) {
    if (isHidden(current)) return false;
  }
  return true;
}

function isHidden(element: Element): boolean {
  return (
    SKIPPED.has(element.tagName) ||
    element.hasAttribute(OVERLAY_MARKER) ||
    element.hasAttribute("hidden") ||
    element.getAttribute("aria-hidden") === "true"
  );
}
