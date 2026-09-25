/**
 * The zero-configuration classifier: length and sentence shape for the
 * pillars, keywords for the kind and the plan. No network, no model, no options.
 *
 * It is what the assist tier does with the model tier switched off, and it is
 * the floor every eval measures against — a model that cannot beat a word
 * list is not worth its latency. `docs/assist.md` says how each pillar is
 * measured and what a measurement is worth.
 */

import {
  COMMENT_KINDS,
  DEFAULT_PILLARS,
  kindFromWeights,
  scoreAtPosition,
  selectPillars,
} from "./classifier.js";
import { keywordPlan } from "./keyword-plan.js";

import type {
  ClassifierConnector,
  ClassifierRequest,
  CommentKind,
  KindGuess,
  MockPlan,
  MockPlanRequest,
  Pillar,
  PillarScore,
  ScoreRequest,
} from "./types.js";

/** Everything the measures read off one comment, worked out once. */
interface Reading {
  readonly body: string;
  readonly words: readonly string[];
  /** The first sentence, lowercased, which is where a comment leans hardest. */
  readonly opening: string;
}

/** A position in `[0, 1]` for one pillar: nought is the bottom rung. */
type Measure = (reading: Reading) => number;

/** Creates the keyword baseline. It takes no options, on purpose. */
export function keywordClassifier(): ClassifierConnector {
  const connector: ClassifierConnector = {
    name: "keyword",
    pillars: DEFAULT_PILLARS,

    score(request: ScoreRequest): Promise<readonly PillarScore[]> {
      try {
        const reading = read(request.body);
        const wanted = selectPillars(connector, request.pillars);

        return Promise.resolve(wanted.map((pillar) => measured(pillar, reading)));
      } catch (error) {
        return Promise.reject(asError(error));
      }
    },

    classify(request: ClassifierRequest): Promise<KindGuess> {
      const body = request.body.trim();
      const weights = {} as Record<CommentKind, number>;
      for (const kind of COMMENT_KINDS) weights[kind] = hits(body, KIND_PATTERNS[kind]);

      return Promise.resolve(kindFromWeights(weights));
    },

    plan(request: MockPlanRequest): Promise<MockPlan> {
      return Promise.resolve(keywordPlan(request));
    },
  };

  return connector;
}

/** An empty field is the bottom rung everywhere, not a middling comment. */
function measured(pillar: Pillar, reading: Reading): PillarScore {
  const measure = MEASURES[pillar.id];
  if (measure === undefined) {
    throw new RangeError(`The keyword baseline cannot measure pillar "${pillar.id}".`);
  }

  return scoreAtPosition(pillar, reading.words.length === 0 ? 0 : measure(reading));
}

function read(body: string): Reading {
  const trimmed = body.trim();

  return {
    body: trimmed,
    words: trimmed.toLowerCase().match(/[a-z0-9']+/g) ?? [],
    opening: (/^[^.!?]*/.exec(trimmed)?.[0] ?? "").toLowerCase().trim(),
  };
}

/** The parts of an interface a comment points at. */
const NOUNS = [
  "avatar",
  "badge",
  "banner",
  "border",
  "breadcrumb",
  "button",
  "card",
  "chart",
  "checkbox",
  "color",
  "colour",
  "column",
  "dialog",
  "dropdown",
  "field",
  "font",
  "footer",
  "form",
  "heading",
  "header",
  "icon",
  "input",
  "label",
  "legend",
  "link",
  "logo",
  "margin",
  "menu",
  "modal",
  "padding",
  "pagination",
  "placeholder",
  "row",
  "shadow",
  "sidebar",
  "slider",
  "spacing",
  "tab",
  "table",
  "title",
  "toast",
  "toggle",
  "tooltip",
];

/** Words that report a problem without naming it. */
const VAGUE = [
  "awkward",
  "bad",
  "broken",
  "gross",
  "horrible",
  "janky",
  "messy",
  "odd",
  "strange",
  "ugly",
  "weird",
  "wrong",
];

/** "Off" is vague only as a verdict; "cut off" names a fault precisely. */
const VAGUE_PHRASES = [/\b(looks?|feels?|seems?|is|are)\s+off\b/];

/** Words that say where on a page something is. */
const PLACES = [
  "above",
  "below",
  "bottom",
  "center",
  "centre",
  "corner",
  "first",
  "footer",
  "header",
  "last",
  "left",
  "menu",
  "modal",
  "nav",
  "navigation",
  "page",
  "right",
  "screen",
  "second",
  "sidebar",
  "third",
  "top",
];

/** Verbs that open an instruction rather than a report. */
const IMPERATIVES = [
  "add",
  "align",
  "change",
  "decrease",
  "delete",
  "drop",
  "fix",
  "grow",
  "hide",
  "increase",
  "lower",
  "make",
  "move",
  "raise",
  "reduce",
  "remove",
  "rename",
  "replace",
  "set",
  "show",
  "shrink",
  "swap",
  "tighten",
  "truncate",
  "use",
  "wrap",
];

/** Phrases that name the change without commanding it. */
const DIRECTION = [/\bshould\b/, /\binstead\b/, /\bneeds? to\b/, /\brather than\b/, /\bmust\b/];

/** A measurement, a quoted run of text and an identifier are all concrete. */
const QUANTITY = /\d ?(px|rem|em|pt|vh|vw|ms|%)/i;
const QUOTED = /["'`“][^"'`”]{2,40}["'`”]/;
const CAMEL = /[a-z][A-Z]/;
const FILENAME = /\.(tsx?|jsx?|css)\b/;

/** Concreteness is any of these; naming a thing is all but the measurement. */
const CONCRETE = [QUANTITY, QUOTED, CAMEL, FILENAME];
const NAMED = [QUOTED, CAMEL, FILENAME];

/** A sentence opening on a bare pronoun is a sentence that needs the screen. */
const DEICTIC = /^(these|this|those|that|there|here|it)\b/;

/** A prepositional phrase is the cheapest signal that a place is named. */
const PREPOSITION = /\b(above|at|below|in|inside|next to|on|under|within)\s+the\b/;

/** Word counts either side of "as short as its point allows". */
const TIGHT = 25;
const RAMBLING = 80;

/** One measure per default pillar, keyed by the id it measures. */
const MEASURES: Readonly<Record<string, Measure>> = {
  specific: ({ body, words }) =>
    weigh(
      count(words, NOUNS) + hits(body, CONCRETE),
      count(words, VAGUE) + hits(body, VAGUE_PHRASES),
    ),
  actionable: ({ body, words }) => fromEvidence(leads(words) + hits(body, DIRECTION)),
  concise: ({ words }) => ramp(words.length, TIGHT, RAMBLING),
  standalone: stands,
  located: ({ body, words }) => fromEvidence(count(words, PLACES) + hits(body, [PREPOSITION])),
};

/** An imperative opening is worth two ordinary signals: it *is* the instruction. */
function leads(words: readonly string[]): number {
  return IMPERATIVES.includes(words[0] ?? "") ? 2 : 0;
}

/** Naming things raises it; opening on a bare pronoun pulls it back down. */
function stands({ body, opening, words }: Reading): number {
  const named = count(words, NOUNS) + hits(body, NAMED);
  const naming = named === 0 ? 2 : 1;

  return weigh(named, DEICTIC.test(opening) ? naming : 0);
}

/** Keywords per kind. `other` has none: it is where a comment lands, not a match. */
const KIND_PATTERNS: Readonly<Record<CommentKind, readonly RegExp[]>> = {
  bug: [
    /\bbroken\b/i,
    /\bdoes ?n[o']t\b/i,
    /\bfails?\b/i,
    /\berror\b/i,
    /\bcrash/i,
    /\bbug\b/i,
    /\bnot working\b/i,
    /\boverlap/i,
    /\bcut off\b/i,
    /\bmissing\b/i,
    /\bwrong\b/i,
  ],
  request: [
    /\bcan we\b/i,
    /\bcould we\b/i,
    /\bwould be (nice|good|great)\b/i,
    /\bplease add\b/i,
    /\blet'?s\b/i,
    /\bwe should\b/i,
    /\badd (a|an|the)\b/i,
  ],
  copy: [
    /\btypo\b/i,
    /\bwording\b/i,
    /\bspelling\b/i,
    /\bgrammar\b/i,
    /\bcapitali[sz]/i,
    /\bshould say\b/i,
    /\brename\b/i,
    /\bcopy\b/i,
  ],
  question: [/\?/, /^(are|can|do|does|how|is|should|what|why)\b/i],
  praise: [
    /\blove (this|it)\b/i,
    /\bnice\b/i,
    /\bgreat\b/i,
    /\blooks good\b/i,
    /\bbeautiful\b/i,
    /\bperfect\b/i,
  ],
  other: [],
};

/** How many of `patterns` the body matches. Presence counts, not repetition. */
function hits(body: string, patterns: readonly RegExp[]): number {
  return patterns.filter((pattern) => pattern.test(body)).length;
}

/** How many of `words` appear in `list`. */
function count(words: readonly string[], list: readonly string[]): number {
  return words.filter((word) => list.includes(word)).length;
}

/** Evidence both ways around a neutral middle. Two signals saturate either side. */
function weigh(forEvidence: number, against: number): number {
  return clamp01(0.5 + 0.25 * capped(forEvidence) - 0.25 * capped(against));
}

/** Evidence one way only: none of it is the bottom rung, two of it is the top. */
function fromEvidence(found: number): number {
  return clamp01(0.15 + 0.425 * found);
}

/** One at `best`, nought at `worst`, linear between. */
function ramp(value: number, best: number, worst: number): number {
  return clamp01((worst - value) / (worst - best));
}

function capped(value: number): number {
  return Math.min(value, 2);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** A connector rejects; it never throws. A non-Error cause is wrapped, not lost. */
function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}
