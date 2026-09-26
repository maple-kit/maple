/**
 * Recording where a comment was left, so it can be found again later.
 *
 * Every rung the page can supply is recorded, not the best one. Which rung
 * survives is not knowable at the time of writing, and a rung costs a few
 * bytes.
 */

import { cssPathTo } from "./selector.js";
import { indexText, positionOf, spanOf } from "./text-position.js";

import type { Span, TextIndex } from "./text-position.js";
import type { Anchor, TextQuote } from "./types.js";

/** How much surrounding text is kept, and how much of the passage itself. */
export interface DescribeOptions {
  /** Subtree the description is relative to. Defaults to the document. */
  readonly root?: ParentNode;
  /** Characters of prefix and suffix kept. Defaults to 32. */
  readonly contextLength?: number;
  /** Longest passage stored. Defaults to 300 characters. */
  readonly maximumQuote?: number;
}

const CONTEXT_LENGTH = 32;
const MAXIMUM_QUOTE = 300;

/** Describes an element a reviewer clicked. */
export function describeElement(element: Element, options: DescribeOptions = {}): Anchor {
  const root = options.root ?? element.ownerDocument;
  const index = indexText(root);
  const span = spanOf(index, element);

  return {
    ...attributesOf(element),
    ...(span ? { quote: quoteAt(index, span.start, span.end, options) } : {}),
    ...withSelector(element, root),
  };
}

/** Describes a passage a reviewer selected. */
export function describeRange(range: Range, options: DescribeOptions = {}): Anchor {
  const element = elementOf(range);
  const root = options.root ?? element.ownerDocument;
  const index = indexText(root);
  const span = spanOfRange(index, range);

  return {
    ...attributesOf(element),
    ...(span ? { quote: quoteAt(index, span.start, span.end, options) } : {}),
    ...withSelector(element, root),
  };
}

function attributesOf(element: Element): Pick<Anchor, "component" | "key" | "source"> {
  const key = closestAttribute(element, "data-maple-key");
  const source = closestAttribute(element, "data-maple-src");
  const component = closestAttribute(element, "data-maple-name");
  return {
    ...(key === undefined ? {} : { key }),
    ...(source === undefined ? {} : { source }),
    ...(component === undefined ? {} : { component }),
  };
}

function withSelector(element: Element, root: ParentNode): Pick<Anchor, "selector"> {
  const selector = cssPathTo(element, root);
  return selector === undefined ? {} : { selector };
}

function closestAttribute(element: Element, name: string): string | undefined {
  return element.closest(`[${name}]`)?.getAttribute(name) ?? undefined;
}

function quoteAt(
  index: TextIndex,
  start: number,
  end: number,
  options: DescribeOptions,
): TextQuote {
  const context = options.contextLength ?? CONTEXT_LENGTH;
  const limit = options.maximumQuote ?? MAXIMUM_QUOTE;
  const stop = Math.min(end, start + limit);

  const prefix = index.text.slice(Math.max(0, start - context), start);
  const suffix = index.text.slice(stop, stop + context);
  return {
    exact: index.text.slice(start, stop),
    ...(prefix ? { prefix } : {}),
    ...(suffix ? { suffix } : {}),
    offset: start,
  };
}

function spanOfRange(index: TextIndex, range: Range): Span | undefined {
  const start = endpoint(index, range.startContainer, range.startOffset);
  const end = endpoint(index, range.endContainer, range.endOffset);
  return start !== undefined && end !== undefined && end > start ? { start, end } : undefined;
}

function endpoint(index: TextIndex, node: Node, offset: number): number | undefined {
  if (node.nodeType === Node.TEXT_NODE) return positionOf(index, node as Text, offset);
  const child = node.childNodes[offset] ?? node.lastChild;
  const element = child instanceof Element ? child : (node as Element);
  return spanOf(index, element)?.start;
}

function elementOf(range: Range): Element {
  const container = range.commonAncestorContainer;
  return container instanceof Element ? container : (container.parentElement as Element);
}
