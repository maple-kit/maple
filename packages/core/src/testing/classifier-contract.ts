/**
 * The shared classifier-connector contract.
 *
 * Every classifier runs this suite. It asserts the semantics a surface relies
 * on, never an implementation: that a judgement carries its own uncertainty,
 * that a pillar nobody configured is refused rather than scored nought, and
 * that a comment mid-sentence is answered rather than rejected.
 */

import { describe, expect, it } from "vitest";

import { supports } from "../connectors/capabilities.js";
import { COMMENT_KINDS } from "../connectors/classifier.js";

import type { ClassifierConnector, KindGuess, PillarScore } from "../connectors/types.js";

/** What the suite needs in order to exercise a connector. */
export interface ClassifierContractOptions {
  /** Shown in the test names, e.g. "keyword". */
  readonly name: string;
  /** Builds an isolated connector. Called once per test. */
  create(): Promise<ClassifierContractSubject>;
}

/** A connector plus whatever is needed to tear it down. */
export interface ClassifierContractSubject {
  readonly connector: ClassifierConnector;
  cleanup?(): Promise<void>;
}

/** A comment written the way a reviewer writes one, and one barely started. */
const WRITTEN = "The Save button's label is cut off at 320px in the settings header.";
const MID_SENTENCE = "the sav";

/** Nothing may be scored against a pillar with this id, in any configuration. */
const NO_SUCH_PILLAR = "definitely-not-a-configured-pillar";

/** Runs the whole contract against one connector. */
export function runClassifierContract(options: ClassifierContractOptions): void {
  describe(`classifier contract: ${options.name}`, () => {
    /** Runs `body` against a fresh connector and always cleans up. */
    async function withSubject(
      body: (connector: ClassifierConnector) => Promise<void>,
    ): Promise<void> {
      const subject = await options.create();
      try {
        await body(subject.connector);
      } finally {
        await subject.cleanup?.();
      }
    }

    it("does at least one of the two things a classifier is for", async () => {
      await withSubject((connector) => {
        expect(supports(connector, "score") || supports(connector, "classify")).toBe(true);
        return Promise.resolve();
      });
    });

    it("declares the pillars it scores, when it scores", async () => {
      await withSubject((connector) => {
        if (connector.score) expect(connector.pillars.length).toBeGreaterThan(0);
        return Promise.resolve();
      });
    });

    it("scores every configured pillar, in the order it declared them", async () => {
      await withSubject(async (connector) => {
        if (!connector.score) return;
        const scores = await connector.score({ body: WRITTEN });

        expect(scores.map((score) => score.pillar)).toEqual(
          connector.pillars.map((pillar) => pillar.id),
        );
      });
    });

    it("puts every level inside the pillar it belongs to", async () => {
      await withSubject(async (connector) => {
        if (!connector.score) return;

        for (const score of await connector.score({ body: WRITTEN })) {
          const pillar = connector.pillars.find((candidate) => candidate.id === score.pillar);
          expect(score.level).toBeGreaterThanOrEqual(0);
          expect(score.level).toBeLessThan(pillar?.levels.length ?? 0);
        }
      });
    });

    it("spends exactly one unit of probability across each pillar's levels", async () => {
      await withSubject(async (connector) => {
        if (!connector.score) return;

        for (const score of await connector.score({ body: WRITTEN })) {
          const pillar = connector.pillars.find((candidate) => candidate.id === score.pillar);
          expect(score.distribution).toHaveLength(pillar?.levels.length ?? 0);
          expectDistribution(score.distribution);
        }
      });
    });

    it("says how sure it is, in a range a surface can render", async () => {
      await withSubject(async (connector) => {
        if (!connector.score) return;

        for (const score of await connector.score({ body: WRITTEN })) {
          expect(score.confidence).toBeGreaterThanOrEqual(0);
          expect(score.confidence).toBeLessThanOrEqual(1);
        }
      });
    });

    it("scores only the pillars it was asked for", async () => {
      await withSubject(async (connector) => {
        const only = connector.pillars[0];
        if (!connector.score || only === undefined) return;

        const scores = await connector.score({ body: WRITTEN, pillars: [only.id] });
        expect(scores.map((score) => score.pillar)).toEqual([only.id]);
      });
    });

    it("refuses a pillar it was never configured with, rather than scoring it nought", async () => {
      await withSubject(async (connector) => {
        if (!connector.score) return;

        await expect(connector.score({ body: WRITTEN, pillars: [NO_SUCH_PILLAR] })).rejects.toThrow(
          NO_SUCH_PILLAR,
        );
      });
    });

    it("answers a comment still being typed, and an empty one", async () => {
      await withSubject(async (connector) => {
        for (const body of [MID_SENTENCE, ""]) {
          if (connector.score) expectScores(await connector.score({ body }));
          if (connector.classify) expectGuess(await connector.classify({ body }));
        }
      });
    });

    it("guesses a kind Maple recognises, and spends one unit across all of them", async () => {
      await withSubject(async (connector) => {
        if (!connector.classify) return;

        expectGuess(await connector.classify({ body: WRITTEN }));
      });
    });
  });
}

/** Probabilities are probabilities: each in range, and one unit in total. */
function expectDistribution(distribution: readonly number[]): void {
  for (const share of distribution) {
    expect(share).toBeGreaterThanOrEqual(0);
    expect(share).toBeLessThanOrEqual(1);
  }
  expect(distribution.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1, 5);
}

function expectScores(scores: readonly PillarScore[]): void {
  for (const score of scores) expectDistribution(score.distribution);
}

function byName(left: string, right: string): number {
  return left.localeCompare(right);
}

function expectGuess(guess: KindGuess): void {
  expect(COMMENT_KINDS).toContain(guess.kind);
  expect(Object.keys(guess.distribution).toSorted(byName)).toEqual(
    [...COMMENT_KINDS].toSorted(byName),
  );
  expectDistribution(Object.values(guess.distribution));
  expect(guess.confidence).toBeGreaterThanOrEqual(0);
  expect(guess.confidence).toBeLessThanOrEqual(1);
}
