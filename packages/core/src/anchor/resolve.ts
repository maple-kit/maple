/**
 * Placing a recorded anchor on the page as it is now.
 *
 * Rungs are tried most durable first and the result says which one worked, so
 * a reviewer can be told how much to trust the pin. When none works the answer
 * is an orphan with a reason — never the nearest ancestor, which is the one
 * behaviour that makes a comment look answered when it is lost.
 */

import { matchQuote } from "../lib/match-quote.js";
import { indexText, rangeAt, spanOf } from "./text-position.js";
import { RUNGS } from "./types.js";

import type { TextIndex } from "./text-position.js";
import type { Anchor, OrphanReason, Resolution, Rung } from "./types.js";

/** How resolution is scoped and how sure it has to be. */
export interface ResolveOptions {
  /** Subtree searched. Defaults to the document. */
  readonly root?: ParentNode;
  /** Quote score below which the passage counts as changed. Defaults to 0.5. */
  readonly minimumScore?: number;
  /**
   * Narrow a resolved element to the passage its quote names. Off by default:
   * an element pick carries a quote too, and there it is only a tiebreak.
   */
  readonly passage?: boolean;
}

/** What each rung is worth when it matches, before any quote score. */
const CONFIDENCE: Record<Rung, number> = {
  key: 1,
  source: 0.9,
  component: 0.7,
  quote: 0.8,
  selector: 0.5,
};

const ATTRIBUTE: Partial<Record<Rung, string>> = {
  key: "data-maple-key",
  source: "data-maple-src",
  component: "data-maple-name",
};

const MINIMUM_SCORE = 0.5;

/** Finds the anchor on the page, or says why it could not be found. */
export function resolveAnchor(anchor: Anchor, options: ResolveOptions = {}): Resolution {
  const root = options.root ?? document;
  const tried: Rung[] = [];
  let ambiguous = false;

  if (isEmpty(anchor)) return { status: "orphaned", reason: "empty", tried };

  let changed = false;
  for (const rung of RUNGS) {
    if (anchor[rung] === undefined) continue;
    tried.push(rung);

    const outcome = attempt(rung, anchor, { root, minimumScore: options.minimumScore });
    if (outcome.status === "resolved") {
      return options.passage === true ? narrowed(outcome, anchor, options) : outcome;
    }
    ambiguous ||= outcome.reason === "ambiguous";
    changed ||= outcome.reason === "changed";
  }

  return { status: "orphaned", reason: reasonFor(ambiguous, changed), tried };
}

/**
 * The passage inside the element a higher rung found. The element stands if
 * the quote cannot be placed in it, which is better than highlighting nothing.
 */
function narrowed(found: Resolution, anchor: Anchor, options: ResolveOptions): Resolution {
  if (found.status !== "resolved" || found.range || !anchor.quote?.exact) return found;

  const index = indexText(found.element);
  const hit = matchQuote(index.text, anchor.quote.exact, context(anchor.quote));
  if (!hit || hit.score < (options.minimumScore ?? MINIMUM_SCORE)) return found;

  const range = rangeAt(index, hit.start, hit.end);
  return range ? { ...found, range } : found;
}

interface Scope {
  readonly root: ParentNode;
  readonly minimumScore: number | undefined;
}

function attempt(rung: Rung, anchor: Anchor, scope: Scope): Resolution {
  if (rung === "quote") return byQuote(anchor, scope);
  if (rung === "selector") return bySelector(anchor.selector!, scope.root);
  return byAttribute(rung, anchor, scope);
}

function byAttribute(rung: Rung, anchor: Anchor, scope: Scope): Resolution {
  const name = ATTRIBUTE[rung]!;
  const value = anchor[rung] as string;
  const matches = [...scope.root.querySelectorAll(`[${name}="${CSS.escape(value)}"]`)];

  if (matches.length === 1) {
    return { status: "resolved", element: matches[0]!, by: rung, confidence: CONFIDENCE[rung] };
  }
  if (matches.length === 0) return orphan("missing", rung);

  const narrowed = narrow(matches, anchor, scope.root);
  return narrowed
    ? {
        status: "resolved",
        element: narrowed.element,
        by: rung,
        confidence: CONFIDENCE[rung] * narrowed.score,
      }
    : orphan("ambiguous", rung);
}

interface Narrowed {
  readonly element: Element;
  readonly score: number;
}

interface Candidate extends Narrowed {
  /** Where its text starts in the page's flat text. */
  readonly start: number;
}

/** Two scores closer than this are the same score, and something else decides. */
const TIE = 1e-9;

/**
 * Picks between elements sharing an attribute — a component rendered twice
 * shares a line and often a text — by the context around each, then offset.
 */
function narrow(
  matches: readonly Element[],
  anchor: Anchor,
  root: ParentNode,
): Narrowed | undefined {
  const quote = anchor.quote;
  if (!quote?.exact) return undefined;

  const index = indexText(root);
  const preferred = anchor.selector === undefined ? undefined : only(anchor.selector, root);
  let best: Candidate | undefined;
  for (const element of matches) {
    const scored = scoreIn(index, element, quote);
    if (scored && (!best || beats(scored, best, { offset: quote.offset, preferred }))) {
      best = scored;
    }
  }
  return best && { element: best.element, score: best.score };
}

/** The quote scored where this element sits, with the page around it as context. */
function scoreIn(
  index: TextIndex,
  element: Element,
  quote: NonNullable<Anchor["quote"]>,
): Candidate | undefined {
  const span = spanOf(index, element);
  if (!span) return undefined;

  const from = Math.max(0, span.start - (quote.prefix?.length ?? 0));
  const to = span.end + (quote.suffix?.length ?? 0);
  // No offset hint: it is an offset into the page, and this is a window of it.
  const around = {
    ...(quote.prefix === undefined ? {} : { prefix: quote.prefix }),
    ...(quote.suffix === undefined ? {} : { suffix: quote.suffix }),
  };
  const found = matchQuote(index.text.slice(from, to), quote.exact, around);
  return found && { element, score: found.score, start: span.start };
}

interface Tiebreak {
  readonly offset: number | undefined;
  readonly preferred: Element | undefined;
}

function beats(one: Candidate, other: Candidate, tiebreak: Tiebreak): boolean {
  if (Math.abs(one.score - other.score) > TIE) return one.score > other.score;
  const { offset } = tiebreak;
  if (offset !== undefined) {
    const nearer = Math.abs(one.start - offset) - Math.abs(other.start - offset);
    if (nearer !== 0) return nearer < 0;
  }
  return one.element === tiebreak.preferred;
}

/** The one element a selector names, or nothing when it names none or several. */
function only(selector: string, root: ParentNode): Element | undefined {
  const found = root.querySelectorAll(selector);
  return found.length === 1 ? found[0] : undefined;
}

function byQuote(anchor: Anchor, scope: Scope): Resolution {
  const quote = anchor.quote;
  if (!quote?.exact) return orphan("missing", "quote");

  const index = indexText(scope.root);
  const found = matchQuote(index.text, quote.exact, context(quote));
  if (!found) return orphan("missing", "quote");
  if (found.score < (scope.minimumScore ?? MINIMUM_SCORE)) return orphan("changed", "quote");

  const range = rangeAt(index, found.start, found.end);
  const element = elementOf(range, index);
  if (!element) return orphan("missing", "quote");

  return {
    status: "resolved",
    element,
    ...(range ? { range } : {}),
    by: "quote",
    confidence: CONFIDENCE.quote * found.score,
  };
}

function context(quote: NonNullable<Anchor["quote"]>): Parameters<typeof matchQuote>[2] {
  return {
    ...(quote.prefix === undefined ? {} : { prefix: quote.prefix }),
    ...(quote.suffix === undefined ? {} : { suffix: quote.suffix }),
    ...(quote.offset === undefined ? {} : { hint: quote.offset }),
  };
}

function bySelector(selector: string, root: ParentNode): Resolution {
  const matches = [...root.querySelectorAll(selector)];
  if (matches.length === 1) {
    return {
      status: "resolved",
      element: matches[0]!,
      by: "selector",
      confidence: CONFIDENCE.selector,
    };
  }
  return orphan(matches.length === 0 ? "missing" : "ambiguous", "selector");
}

function elementOf(range: Range | undefined, index: TextIndex): Element | undefined {
  if (range) {
    const container = range.commonAncestorContainer;
    return container instanceof Element ? container : (container.parentElement ?? undefined);
  }
  return index.segments[0]?.node.parentElement ?? undefined;
}

function orphan(reason: OrphanReason, rung: Rung): Resolution {
  return { status: "orphaned", reason, tried: [rung] };
}

function isEmpty(anchor: Anchor): boolean {
  return RUNGS.every((rung) => anchor[rung] === undefined);
}

function reasonFor(ambiguous: boolean, changed: boolean): OrphanReason {
  if (ambiguous) return "ambiguous";
  return changed ? "changed" : "missing";
}
