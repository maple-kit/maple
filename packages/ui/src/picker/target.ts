/**
 * Turning what a reviewer clicked into what the composer opens on.
 *
 * The three picks differ only in what they hand over: an element, a passage,
 * or a rectangle and the box it was drawn inside. All three come out as one
 * `ComposerTarget`, so the composer never learns which of them it was — the
 * kind is recorded on the anchor and read back by `kindOf`.
 */

import {
  captureMembers,
  describeElement,
  describeRange,
  labelFor,
  locateSource,
  regionOf,
} from "@maple-kit/core/anchor";
import { toCommentContext } from "@maple-kit/core/overlay";

import type { Anchor } from "@maple-kit/core/anchor";
import type { ComposerTarget } from "@maple-kit/core/client";
import type { PageContext, Pick } from "@maple-kit/core/overlay";

/** What the anchor is described against, and the page as it was at pick time. */
export interface TargetOptions {
  /** Defaults to the picked element's own document. */
  readonly root?: ParentNode;
  /** Recorded with the comment. Captured by the caller, so a test can hand one in. */
  readonly page?: PageContext;
}

/**
 * The element a pick is about. For a region it is the box the rectangle was
 * drawn inside, which is what its fractions are measured against and not what
 * the comment is about.
 */
export function elementOf(pick: Pick): Element | undefined {
  return pick.kind === "text" ? rangeElement(pick.range) : pick.element;
}

/**
 * The target, or nothing when a passage sat in no element at all. A region
 * always has one: `containerFor` walks up to `documentElement` if it must, and
 * a rectangle over the page's own background is still a rectangle.
 */
export function targetFor(pick: Pick, options: TargetOptions = {}): ComposerTarget | undefined {
  const element = elementOf(pick);
  if (!element) return undefined;

  const anchor = located(anchorFor(pick, element, options.root), element);
  // The bare name, not the phrase: `ComposerTarget.label` is "the Yield card",
  // and every surface that shows it wraps it in its own words. Storing "an area
  // of the Yield card" here is how the panel came to read "on an area of an
  // area of the Yield card".
  const label = labelFor({ element, anchor });

  return {
    kind: pick.kind,
    anchor,
    ...(label === undefined ? {} : { label }),
    ...(options.page === undefined ? {} : { context: toCommentContext(options.page) }),
  };
}

/**
 * A passage is described from its range; the other two from their element. A
 * region adds its rectangle and the elements it covers.
 */
function anchorFor(pick: Pick, element: Element, root: ParentNode | undefined): Anchor {
  const options = root === undefined ? {} : { root };
  if (pick.kind === "text") return describeRange(pick.range, options);

  const described = describeElement(element, options);
  if (pick.kind !== "region") return described;
  const members = captureMembers(pick.rect, options);
  return {
    ...described,
    region: regionOf(pick.rect, element.getBoundingClientRect()),
    ...(members.length === 0 ? {} : { members }),
  };
}

/**
 * Says which rung supplied the file and line: the tagger's attribute, or,
 * on a page that installed a locator (`maple review`), its source maps.
 */
function located(anchor: Anchor, element: Element): Anchor {
  if (anchor.source !== undefined) return { ...anchor, locatedBy: "tagger" };
  const found = locateSource(element);
  if (found === undefined) return anchor;
  const component = anchor.component ?? found.component;
  return {
    ...anchor,
    source: found.source,
    ...(component === undefined ? {} : { component }),
    locatedBy: "owner-stack",
  };
}

/** The element a range sits in, which for a text node is its parent. */
function rangeElement(range: Range): Element | undefined {
  const node = range.commonAncestorContainer;
  return node instanceof Element ? node : (node.parentElement ?? undefined);
}
