/**
 * The vocabulary a classifier connector speaks: the pillars Maple ships with,
 * the kinds it recognises, and the arithmetic that turns one measurement into
 * a level with the distribution and the confidence that make it honest.
 *
 * `docs/assist.md` is the design record — what a score is, and what it is not.
 */

import type { ClassifierConnector, CommentKind, KindGuess, Pillar, PillarScore } from "./types.js";

/**
 * The five dimensions Maple scores a comment against by default.
 *
 * A host may configure its own set; a reviewer may not. Every level describes
 * a concrete comment rather than a grade, because "medium" is not a thing a
 * person or a model can judge a sentence against.
 */
export const DEFAULT_PILLARS: readonly Pillar[] = [
  {
    id: "specific",
    instruction: "Does the comment name what is wrong, rather than only that something is?",
    levels: [
      {
        label: "Names nothing",
        description: "Says something is wrong without naming what: “this looks off”, “broken”.",
      },
      {
        label: "Names the thing",
        description: "Names the element or the copy, but not what is wrong with it.",
      },
      {
        label: "Names the fault",
        description: "Names the element and the fault in it, precisely enough to look at.",
      },
    ],
  },
  {
    id: "actionable",
    instruction: "Would a reader know what to change after reading this?",
    levels: [
      {
        label: "Reports only",
        description: "Describes a problem and leaves entirely open what to do about it.",
      },
      {
        label: "Implies a direction",
        description: "Hints at the change without saying what the result should be.",
      },
      {
        label: "Says the change",
        description: "States the change to make, or the state the reader should end up at.",
      },
    ],
  },
  {
    id: "concise",
    instruction: "Is the comment as short as its point allows?",
    levels: [
      {
        label: "Rambling",
        description: "Long enough that the reader has to find the point inside it.",
      },
      {
        label: "Padded",
        description: "Makes its point, with preamble or repetition around it.",
      },
      {
        label: "Tight",
        description: "One or two sentences carrying the whole point and nothing else.",
      },
    ],
  },
  {
    id: "standalone",
    instruction: "Does the comment read correctly without the page in front of you?",
    levels: [
      {
        label: "Needs the screen",
        description:
          "Leans on “this”, “that” or “here” with no noun; unreadable away from the page.",
      },
      {
        label: "Partly anchored",
        description: "Names some of what it is about and points at the rest.",
      },
      {
        label: "Stands alone",
        description: "Reads correctly in a pull request, with no screenshot beside it.",
      },
    ],
  },
  {
    id: "located",
    instruction: "Do the words say where on the page this is?",
    levels: [
      {
        label: "Unplaced",
        description: "Nothing in the words says where on the page this is.",
      },
      {
        label: "Roughly placed",
        description: "Names a page or a region, but not the element inside it.",
      },
      {
        label: "Placed",
        description: "Names where it is precisely enough to find without hunting.",
      },
    ],
  },
];

/**
 * Every kind Maple recognises. The order is the tie-break: a comment matching
 * two kinds equally is read as the earlier one.
 */
export const COMMENT_KINDS: readonly CommentKind[] = [
  "bug",
  "request",
  "copy",
  "question",
  "praise",
  "other",
];

/** What a comment is when nothing else fits. An absence, never a judgement. */
export const FALLBACK_KIND: CommentKind = "other";

/** Raised when a classifier is asked for a pillar it was never configured with. */
export class UnknownPillarError extends Error {
  override readonly name = "UnknownPillarError";

  constructor(
    readonly connector: string,
    readonly pillar: string,
    readonly known: readonly string[],
  ) {
    const scores = known.length === 0 ? "nothing" : known.join(", ");
    super(`Classifier "${connector}" has no pillar "${pillar}". It scores: ${scores}.`);
  }
}

/**
 * The pillars `requested` names, in the order they were asked for.
 *
 * It throws rather than quietly returning fewer: a pillar that silently
 * scores zero is a comment marked down on a dimension nobody measured.
 */
export function selectPillars(
  connector: ClassifierConnector,
  requested: readonly string[] | undefined,
): readonly Pillar[] {
  if (requested === undefined) return connector.pillars;

  return requested.map((id) => {
    const pillar = connector.pillars.find((candidate) => candidate.id === id);
    if (pillar === undefined) {
      throw new UnknownPillarError(connector.name, id, connector.pillars.map(idOf));
    }
    return pillar;
  });
}

function idOf(pillar: Pillar): string {
  return pillar.id;
}

/** How far a measurement's probability bleeds into neighbouring levels. */
const SPREAD = 1.5;

/**
 * Turns a measurement in `[0, 1]` into a score on `pillar`'s levels.
 *
 * The distribution is a bell over the levels rather than a spike, because a
 * measurement landing between two rungs really did land between them, and a
 * connector without probabilities of its own should not pretend to certainty.
 */
export function scoreAtPosition(pillar: Pillar, position: number, spread = SPREAD): PillarScore {
  const count = pillar.levels.length;
  if (count === 0) throw new RangeError(`Pillar "${pillar.id}" has no levels to score against.`);

  const at = clamp01(position) * (count - 1);
  const distribution = normalise(pillar.levels.map((_, index) => bell(index - at, spread)));
  const level = argmax(distribution);

  return { pillar: pillar.id, level, distribution, confidence: distribution[level] ?? 0 };
}

/**
 * Turns per-kind evidence into a guess.
 *
 * Every kind keeps a share of the probability, so one keyword never reads as
 * a certainty. Evidence for nothing is answered with {@link FALLBACK_KIND}
 * rather than with whichever kind happens to sort first.
 */
export function kindFromWeights(
  weights: Readonly<Partial<Record<CommentKind, number>>>,
): KindGuess {
  const evidence = COMMENT_KINDS.map((kind) => Math.max(0, weights[kind] ?? 0));
  const shares = normalise(evidence.map((weight) => BASE_SHARE + weight));

  const distribution = {} as Record<CommentKind, number>;
  COMMENT_KINDS.forEach((kind, index) => {
    distribution[kind] = shares[index] ?? 0;
  });

  const found = evidence.some((weight) => weight > 0);
  const kind = (found ? COMMENT_KINDS[argmax(evidence)] : FALLBACK_KIND) ?? FALLBACK_KIND;
  return { kind, distribution, confidence: distribution[kind] };
}

/** The probability every kind holds before any evidence is weighed. */
const BASE_SHARE = 0.5;

function bell(distance: number, spread: number): number {
  return Math.exp(-((distance / spread) ** 2));
}

/** Scales weights so they sum to one. Every caller's weights are positive. */
function normalise(weights: readonly number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => weight / total);
}

/** The first index holding the largest value, so ties go to the earlier one. */
function argmax(values: readonly number[]): number {
  return values.reduce((best, value, index) => (value > (values[best] ?? 0) ? index : best), 0);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
