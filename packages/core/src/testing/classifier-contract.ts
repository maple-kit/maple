/**
 * The shared classifier-connector contract.
 *
 * Every classifier runs this suite. It asserts the semantics a surface relies
 * on, never an implementation: that a judgement carries its own uncertainty,
 * that a pillar nobody configured is refused rather than scored nought, that a
 * comment mid-sentence is answered, and that a plan answers every call once.
 */

import { describe, expect, it } from "vitest";

import { supports } from "../connectors/capabilities.js";
import { COMMENT_KINDS } from "../connectors/classifier.js";
import { MOCK_PLAN_STATES } from "../connectors/plan.js";

import type {
  ClassifierConnector,
  KindGuess,
  MockPlan,
  MockPlanRequest,
  PillarScore,
} from "../connectors/types.js";

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

/** A sentence a reviewer types into the mock box, against a route's calls. */
const MOCK_REQUEST: MockPlanRequest = {
  request: "show the roast list empty",
  route: "/roasts",
  calls: [
    { key: "trpc:roast.list", summary: "Roast[]: every roast, newest first" },
    { key: "trpc:user.me", summary: "User: who is signed in" },
    { key: "rest:POST /api/roasts", summary: "Roast: creates a roast (mutation)" },
  ],
};

/** The same sentence, on a page that evaluated flags and whose host lists roles. */
const LAYERED_REQUEST: MockPlanRequest = {
  ...MOCK_REQUEST,
  request: "show the roast list empty as a barista with the new roaster off",
  flags: [
    { key: "new-roaster", type: "boolean" },
    { key: "roast-tier", type: "string", variants: ["gold", "free"] },
  ],
  roles: ["owner", "barista"],
};

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

    it("does at least one of the things a classifier is for", async () => {
      await withSubject((connector) => {
        const methods = ["score", "classify", "plan"];
        expect(methods.some((method) => supports(connector, method))).toBe(true);
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

    it("plans a state Maple recognises, and spends one unit across all of them", async () => {
      await withSubject(async (connector) => {
        if (!connector.plan) return;

        expectPlan(await connector.plan(MOCK_REQUEST), MOCK_REQUEST);
      });
    });

    it("answers every call once, in order, and only the calls it was given", async () => {
      await withSubject(async (connector) => {
        if (!connector.plan) return;
        const plan = await connector.plan(MOCK_REQUEST);

        expect(plan.calls.map((call) => call.key)).toEqual(MOCK_REQUEST.calls.map((c) => c.key));
      });
    });

    it("answers every listed flag once, in order, with a value it can take, and names only a listed role", async () => {
      await withSubject(async (connector) => {
        if (!connector.plan) return;
        const plan = await connector.plan(LAYERED_REQUEST);

        expectPlan(plan, LAYERED_REQUEST);
        expect(plan.flags?.map((flag) => flag.key)).toEqual(["new-roaster", "roast-tier"]);
        expect([true, false]).toContain(plan.flags?.[0]?.value);
        expect(["gold", "free"]).toContain(plan.flags?.[1]?.value);
        if (plan.role !== undefined) expect(LAYERED_REQUEST.roles).toContain(plan.role.role);
      });
    });

    it("names no flag and no role for a request that lists none", async () => {
      await withSubject(async (connector) => {
        if (!connector.plan) return;
        const plan = await connector.plan(MOCK_REQUEST);

        expect(plan.flags ?? []).toEqual([]);
        expect(plan.role).toBeUndefined();
      });
    });

    it("plans a sentence still being typed, an empty one, and a route with no calls", async () => {
      await withSubject(async (connector) => {
        if (!connector.plan) return;

        for (const request of ["show the ro", ""]) {
          expectPlan(await connector.plan({ ...MOCK_REQUEST, request }), MOCK_REQUEST);
        }
        const bare = { ...MOCK_REQUEST, calls: [] };
        expectPlan(await connector.plan(bare), bare);
      });
    });
  });
}

/** A plan is a distribution over every state, and one honest verdict per call. */
function expectPlan(plan: MockPlan, request: MockPlanRequest): void {
  expect(MOCK_PLAN_STATES).toContain(plan.state);
  expect(Object.keys(plan.distribution).toSorted(byName)).toEqual(
    [...MOCK_PLAN_STATES].toSorted(byName),
  );
  expectDistribution(Object.values(plan.distribution));
  expect(plan.confidence).toBeGreaterThanOrEqual(0);
  expect(plan.confidence).toBeLessThanOrEqual(1);

  expect(plan.calls).toHaveLength(request.calls.length);
  for (const verdict of [...plan.calls, ...(plan.flags ?? [])]) {
    expect(verdict.p).toBeGreaterThanOrEqual(0);
    expect(verdict.p).toBeLessThanOrEqual(1);
    expect(verdict.concerned).toBe(verdict.p >= 0.5);
  }
  if (plan.role !== undefined) {
    expect(plan.role.p).toBeGreaterThanOrEqual(0);
    expect(plan.role.p).toBeLessThanOrEqual(1);
  }
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
