/**
 * The vocabulary a planner speaks: the states a sentence can name, and the
 * arithmetic that turns per-state evidence into a distribution and a
 * confidence. It mirrors `kindFromWeights`, for a planner with no
 * probabilities of its own. `docs/mock.md` is the design record.
 */

import type { FlagValue, MockState } from "../mock/recipe.js";
import type { MockPlan, MockPlanFlag, MockPlanState, PlannedCall, PlannedFlag } from "./types.js";

/**
 * Every state a plan can pick, `none` last. The order is the tie-break: two
 * states with equal evidence are read as the earlier one. A recipe state is
 * listed here only once the plan evals measure it.
 */
export const MOCK_PLAN_STATES = [
  "empty",
  "error",
  "forbidden",
  "loading",
  "one",
  "many",
  "none",
] as const satisfies readonly (MockState | "none")[];

/**
 * What each state means, in the words a model is asked to judge against. It
 * lives beside the vocabulary so two providers cannot read `empty` two ways.
 */
export const MOCK_PLAN_STATE_DESCRIPTIONS: Readonly<Record<MockPlanState, string>> = {
  empty: "The data exists but has nothing in it: no items, no results, a first visit.",
  error: "Loading the data fails: the server errors, is down, or answers with a failure.",
  forbidden: "The reviewer may not see the data: no permission, no access, a 403.",
  loading: "The data has not arrived yet: a spinner, a skeleton, a slow answer.",
  one: "Exactly one item: a single result, a lone entry.",
  many: "A great many items: a long list, pagination, overflow, hundreds of rows.",
  none: "The request names no state the data can be in, or not yet: a style, copy or layout change.",
};

/** A plan's state and its spread, without the calls. */
export type StateGuess = Pick<MockPlan, "confidence" | "distribution" | "state">;

/** The probability every state holds before any evidence is weighed. */
const BASE_SHARE = 0.2;

/**
 * Turns per-state evidence into a guess. Every state keeps a share, so one
 * matched word never reads as a certainty; evidence for nothing is `none`.
 */
export function stateFromWeights(
  weights: Readonly<Partial<Record<MockPlanState, number>>>,
): StateGuess {
  const found = MOCK_PLAN_STATES.some((state) => state !== "none" && (weights[state] ?? 0) > 0);
  const evidence = MOCK_PLAN_STATES.map((state) =>
    state === "none" && !found ? 1 : Math.max(0, weights[state] ?? 0),
  );
  const total = evidence.reduce((sum, weight) => sum + BASE_SHARE + weight, 0);

  const distribution = {} as Record<MockPlanState, number>;
  MOCK_PLAN_STATES.forEach((state, index) => {
    distribution[state] = (BASE_SHARE + (evidence[index] ?? 0)) / total;
  });

  const state = MOCK_PLAN_STATES[argmax(evidence)] ?? "none";
  return { state, distribution, confidence: distribution[state] };
}

/** One call's verdict. `concerned` is derived, so the two cannot disagree. */
export function plannedCall(key: string, p: number): PlannedCall {
  const clamped = Math.min(1, Math.max(0, p));
  return { key, concerned: clamped >= 0.5, p: clamped };
}

/** One flag's verdict. `concerned` is derived, as a call's is. */
export function plannedFlag(key: string, value: FlagValue, p: number): PlannedFlag {
  const clamped = Math.min(1, Math.max(0, p));
  return { key, value, concerned: clamped >= 0.5, p: clamped };
}

/** The values a plan may set a flag to: a boolean's two, else the ones its source lists. */
export function flagValues(flag: MockPlanFlag): readonly FlagValue[] {
  return flag.type === "boolean" ? [true, false] : (flag.variants ?? []);
}

/** The first index holding the largest value, so ties go to the earlier one. */
function argmax(values: readonly number[]): number {
  return values.reduce((best, value, index) => (value > (values[best] ?? 0) ? index : best), 0);
}
