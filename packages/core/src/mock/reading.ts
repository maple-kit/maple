/**
 * The calm-UI gate over a plan, which the mock box and `maple mock plan`
 * share: what, of a plan, a surface says at all. It is here, beside the
 * recipe, because the page reads it and must not load the connectors.
 */

import { MOCK_STATES } from "./recipe.js";

import type { MockPlan } from "../connectors/types.js";
import type { MockState } from "./recipe.js";

/** One suggestion: a state, and the calls it would put in it. */
export interface MockSuggestion {
  readonly state: MockState;
  readonly calls: readonly string[];
}

/** What a plan leaves a surface to say. */
export interface PlanReading {
  readonly suggestions: readonly MockSuggestion[];
  /** True when the sentence was read, confidently, as naming no state. */
  readonly unnamed: boolean;
}

/** Below this the plan is a shrug, and a shrug is said as nothing. */
export const PLAN_FLOOR = 0.4;

/** Two states this close are both offered, rather than one guessed. */
export const PLAN_TIE = 0.15;

const NOTHING: PlanReading = { suggestions: [], unnamed: false };

/**
 * The calm-UI gate the box and `maple mock plan` share. Under
 * {@link PLAN_FLOOR}, nothing; `none`, unnamed; a runner-up within
 * {@link PLAN_TIE}, two suggestions; a state no call is in, nothing.
 */
export function readPlan(plan: MockPlan | null): PlanReading {
  if (plan === null || plan.confidence < PLAN_FLOOR) return NOTHING;
  if (plan.state === "none") return { suggestions: [], unnamed: true };

  const calls = plan.calls.filter((call) => call.concerned).map((call) => call.key);
  if (calls.length === 0) return NOTHING;

  const others = MOCK_STATES.filter((state) => state !== plan.state);
  const runnerUp = others.reduce<MockState | undefined>(
    (best, state) =>
      best === undefined || plan.distribution[state] > plan.distribution[best] ? state : best,
    undefined,
  );
  const tied =
    runnerUp !== undefined &&
    plan.distribution[plan.state] - plan.distribution[runnerUp] <= PLAN_TIE;
  const states = tied ? [plan.state, runnerUp] : [plan.state];
  return { suggestions: states.map((state) => ({ state, calls })), unnamed: false };
}
