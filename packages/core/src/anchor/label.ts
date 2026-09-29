/**
 * The name a person would use for the thing a comment is on — "the Yield card".
 *
 * An application says it with `data-maple-label`, on the element or on any
 * ancestor of it, so one attribute on a card names everything inside it. When
 * nothing says it, the component's own name is unpicked into a noun phrase,
 * which is a guess but a recognisable one. An acronym stays an acronym: a
 * reviewer reads "API key card", never "A P I Key card".
 */

import { LABEL_ATTRIBUTE, NAME_ATTRIBUTE, SOURCE_ATTRIBUTE } from "../tagger/attributes.js";

import type { Anchor } from "./types.js";

/** Where a label may be read from. Both are optional and either may supply it. */
export interface LabelSource {
  /** The element the comment resolved to, when the page still has one. */
  readonly element?: Element | null;
  /** The anchor the comment recorded, read when there is no element left. */
  readonly anchor?: Pick<Anchor, "component" | "members" | "source">;
}

/** An acronym, a capitalised or lowercase word, or a run of digits. */
const WORD = /[A-Z]+(?![a-z])|[A-Z]?[a-z\d]+|\d+/g;

const ACRONYM = /^[A-Z\d]{2,}$/;

/**
 * The human name for what a comment is on, or undefined when nothing names it.
 *
 * Nearest label wins, then the anchor's component name, then the component name
 * the page itself carries. A blank attribute counts as unsaid.
 */
export function labelFor(source: LabelSource): string | undefined {
  const { anchor, element } = source;
  // A region is about what it covers, not the box it was measured in.
  const covered = anchor ? nameMembers(anchor, { human: true }) : undefined;
  if (covered) return covered;

  const written = element ? closestAttribute(element, LABEL_ATTRIBUTE) : undefined;
  if (written) return written;

  const component =
    anchor?.component ?? (element ? closestAttribute(element, NAME_ATTRIBUTE) : undefined);
  return component ? unpickCamelCase(component) : undefined;
}

/** Longest stretch of a quote used to name a member that no tag names. */
const QUOTE_NAME = 24;

/**
 * What a region covers, as its first member and a count: `BrewGuideCard +1`.
 * With `human`, a component name is unpicked the way `labelFor` does it.
 */
export function nameMembers(
  anchor: Pick<Anchor, "members">,
  options: { readonly human?: boolean } = {},
): string | undefined {
  const [first, ...rest] = anchor.members ?? [];
  if (!first) return undefined;

  const { component, quote, selector, source } = first.anchor;
  const quoted = quote ? `“${quote.exact.trim().slice(0, QUOTE_NAME)}”` : undefined;
  const tagged = options.human === true && component ? unpickCamelCase(component) : component;
  const name = tagged ?? quoted ?? source ?? selector;
  return name && (rest.length === 0 ? name : `${name} +${String(rest.length)}`);
}

/**
 * Where the thing a comment is on is written, as `path/to/file.tsx:line:col`.
 *
 * The page wins over the anchor: the anchor records where the element was when
 * the comment was written, and a redeploy since has moved the line. Undefined
 * on a build that never ran the tagger, which is most of them.
 */
export function sourceFor(source: LabelSource): string | undefined {
  const { anchor, element } = source;
  const written = element ? closestAttribute(element, SOURCE_ATTRIBUTE) : undefined;
  return written ?? anchor?.source;
}

/**
 * Unpicks a component name into a noun phrase: `YieldCard` → `Yield card`.
 *
 * Every word after the first is lower-cased so the result reads the way it is
 * said out loud, except an acronym, which is left as it was written.
 */
export function unpickCamelCase(name: string): string {
  const words = name.match(WORD) ?? [];
  return words.map((word, index) => (index === 0 ? leading(word) : trailing(word))).join(" ");
}

function leading(word: string): string {
  if (ACRONYM.test(word)) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function trailing(word: string): string {
  return ACRONYM.test(word) ? word : word.toLowerCase();
}

function closestAttribute(element: Element, name: string): string | undefined {
  return element.closest(`[${name}]`)?.getAttribute(name)?.trim() || undefined;
}
