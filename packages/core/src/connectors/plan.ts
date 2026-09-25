/**
 * The vocabulary a planner speaks: the states a sentence can name, and the
 * arithmetic that turns per-state evidence into a distribution and a
 * confidence. It mirrors `kindFromWeights`, for a planner with no
 * probabilities of its own. `docs/mock.md` is the design record.
 */

import { MOCK_STATES } from "../mock/recipe.js";

import type { MockPlan, MockPlanState, PlannedCall } from "./types.js";

/**
 * Every state a plan can pick, `none` last. The order is the tie-break: two
 * states with equal evidence are read as the earlier one.
 */
export const MOCK_PLAN_STATES: readonly MockPlanState[] = [...MOCK_STATES, "none"];

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
  const found = MOCK_STATES.some((state) => (weights[state] ?? 0) > 0);
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

/** The first index holding the largest value, so ties go to the earlier one. */
function argmax(values: readonly number[]): number {
  return values.reduce((best, value, index) => (value > (values[best] ?? 0) ? index : best), 0);
}
