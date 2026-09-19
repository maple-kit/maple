/**
 * Turning what a reviewer clicked into what the composer opens on.
 *
 * The three picks differ only in what they hand over: an element, a passage,
 * or a rectangle whose middle names an element. All three come out as one
 * `ComposerTarget`, so the composer never learns which of them it was — the
 * kind is recorded on the target and read back by the ring's label.
 */

import { describeElement, describeRange } from "@maple-kit/core/anchor";
import { elementAt, toCommentContext } from "@maple-kit/core/overlay";

import { ringLabel } from "../marks/label.js";

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

/** The element a pick is about, which for a region is whatever it covers. */
export function elementOf(pick: Pick): Element | undefined {
  if (pick.kind === "element") return pick.element;
  if (pick.kind === "text") return rangeElement(pick.range);
  return elementAt(pick.rect.x + pick.rect.width / 2, pick.rect.y + pick.rect.height / 2);
}

/**
 * The target, or nothing when a region covered no element at all — over a
 * page's own background there is nothing to anchor to, and an anchor that
 * names nothing orphans on the next load rather than on this one.
 */
export function targetFor(pick: Pick, options: TargetOptions = {}): ComposerTarget | undefined {
  const element = elementOf(pick);
  if (!element) return undefined;

  const anchor = anchorFor(pick, element, options.root);
  const label = ringLabel({ kind: pick.kind, element, anchor });

  return {
    kind: pick.kind,
    anchor,
    label,
    ...(options.page === undefined ? {} : { context: toCommentContext(options.page) }),
  };
}

/** A passage is described from its range; the other two from their element. */
function anchorFor(pick: Pick, element: Element, root: ParentNode | undefined): Anchor {
  const options = root === undefined ? {} : { root };
  return pick.kind === "text"
    ? describeRange(pick.range, options)
    : describeElement(element, options);
}

/** The element a range sits in, which for a text node is its parent. */
function rangeElement(range: Range): Element | undefined {
  const node = range.commonAncestorContainer;
  return node instanceof Element ? node : (node.parentElement ?? undefined);
}
