/**
 * A classifier connector that answers from its options and remembers what it
 * was asked.
 *
 * It exists so the contract suite has a reference to run against, and so a
 * test can drive the assist path without a model. Nothing here judges
 * anything: the answer is whatever the options said it would be.
 */

import {
  DEFAULT_PILLARS,
  kindFromWeights,
  scoreAtPosition,
  selectPillars,
} from "../connectors/classifier.js";

import type {
  ClassifierConnector,
  ClassifierRequest,
  CommentKind,
  KindGuess,
  Pillar,
  PillarScore,
  ScoreRequest,
} from "../connectors/types.js";

/** Options for {@link memoryClassifier}. */
export interface MemoryClassifierOptions {
  /** Connector name reported to Maple. Defaults to `"memory"`. */
  readonly name?: string;
  /** The pillars it scores. Defaults to {@link DEFAULT_PILLARS}. */
  readonly pillars?: readonly Pillar[];
  /** Where on every pillar a comment lands, from 0 to 1. Defaults to the middle. */
  readonly at?: number;
  /** The kind every comment is classified as. Defaults to `"other"`. */
  readonly kind?: CommentKind;
  /** Which methods to define, to exercise a half-capable connector. Defaults to both. */
  readonly methods?: readonly ("classify" | "score")[];
}

/** A classifier connector plus the history a test asserts on. */
export interface MemoryClassifier extends ClassifierConnector {
  /** Every body it was asked about, oldest first. */
  asked(): readonly string[];
  /** Forgets everything, so one test cannot see another's. */
  reset(): void;
}

/** Creates an in-memory classifier connector. */
export function memoryClassifier(options: MemoryClassifierOptions = {}): MemoryClassifier {
  const methods = options.methods ?? ["score", "classify"];
  const at = options.at ?? 0.5;
  const bodies: string[] = [];

  const connector: MemoryClassifier = {
    name: options.name ?? "memory",
    pillars: options.pillars ?? DEFAULT_PILLARS,
    asked: () => [...bodies],
    reset: () => {
      bodies.length = 0;
    },
  };

  if (methods.includes("score")) {
    connector.score = (request: ScoreRequest): Promise<readonly PillarScore[]> => {
      bodies.push(request.body);

      try {
        const wanted = selectPillars(connector, request.pillars);
        return Promise.resolve(wanted.map((pillar) => scoreAtPosition(pillar, at)));
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    };
  }

  if (methods.includes("classify")) {
    connector.classify = (request: ClassifierRequest): Promise<KindGuess> => {
      bodies.push(request.body);

      return Promise.resolve(kindFromWeights({ [options.kind ?? "other"]: 2 }));
    };
  }

  return connector;
}
