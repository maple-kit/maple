/**
 * Finding a quoted passage again in text that has since changed.
 *
 * Ported from the Hypothesis client's `match-quote.ts` (BSD-2-Clause), the
 * most-exercised implementation of W3C Web Annotation text anchoring there is.
 * The weights and the shape of the result are theirs; the approximate search
 * underneath is ours. This directory's README says why Maple ports rather than
 * depends.
 */

import { search } from "./approx-string-match.js";

/** What was recorded around the quote when the comment was left. */
export interface QuoteContext {
  /** Text immediately before the quote, as it read then. */
  readonly prefix?: string;
  /** Text immediately after the quote, as it read then. */
  readonly suffix?: string;
  /** Offset the quote was at, used to break ties between equal candidates. */
  readonly hint?: number;
}

/** Where the quote was found, and how much the match is trusted. */
export interface QuoteMatch {
  readonly start: number;
  readonly end: number;
  /** Between 0 and 1. Weighs the quote itself far above its surroundings. */
  readonly score: number;
}

const QUOTE_WEIGHT = 50;
const PREFIX_WEIGHT = 20;
const SUFFIX_WEIGHT = 20;
const POSITION_WEIGHT = 2;
const TOTAL_WEIGHT = QUOTE_WEIGHT + PREFIX_WEIGHT + SUFFIX_WEIGHT + POSITION_WEIGHT;

/** Half the quote may have changed before it stops counting as the same quote. */
const ERROR_BUDGET = 0.5;
const MAX_ERRORS = 256;

/**
 * The best place `quote` occurs in `text`, or undefined when it does not occur
 * closely enough to be worth offering.
 *
 * The caller decides what score is good enough. Maple treats anything below
 * its threshold as an orphan rather than snapping to the nearest ancestor.
 */
export function matchQuote(
  text: string,
  quote: string,
  context: QuoteContext = {},
): QuoteMatch | undefined {
  if (quote.length === 0) return undefined;

  const maxErrors = Math.min(MAX_ERRORS, quote.length * ERROR_BUDGET);
  const candidates = search(text, quote, maxErrors);
  if (candidates.length === 0) return undefined;

  let best: QuoteMatch | undefined;
  for (const candidate of candidates) {
    const scored = {
      start: candidate.start,
      end: candidate.end,
      score: score(text, quote, context, candidate),
    };
    if (!best || scored.score > best.score) best = scored;
  }
  return best;
}

interface Candidate {
  readonly start: number;
  readonly end: number;
  readonly errors: number;
}

function score(text: string, quote: string, context: QuoteContext, candidate: Candidate): number {
  const quoteScore = 1 - candidate.errors / quote.length;
  const prefixScore = contextScore(
    text.slice(Math.max(0, candidate.start - (context.prefix?.length ?? 0)), candidate.start),
    context.prefix,
  );
  const suffixScore = contextScore(
    text.slice(candidate.end, candidate.end + (context.suffix?.length ?? 0)),
    context.suffix,
  );
  const positionScore =
    context.hint === undefined || text.length === 0
      ? 1
      : 1 - Math.abs(candidate.start - context.hint) / text.length;

  const total =
    QUOTE_WEIGHT * quoteScore +
    PREFIX_WEIGHT * prefixScore +
    SUFFIX_WEIGHT * suffixScore +
    POSITION_WEIGHT * positionScore;
  return total / TOTAL_WEIGHT;
}

/**
 * How well a recorded piece of context still matches what is there now. An
 * absent expectation scores 1: nothing was promised, so nothing is broken.
 */
function contextScore(actual: string, expected: string | undefined): number {
  if (expected === undefined || expected.length === 0) return 1;
  if (actual.length === 0) return 0;

  const [match] = search(actual, expected, expected.length);
  return match ? 1 - match.errors / expected.length : 0;
}
