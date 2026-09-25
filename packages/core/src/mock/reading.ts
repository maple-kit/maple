/**
 * The calm-UI gate over a plan, which the mock box and `maple mock plan`
 * share: what, of a plan, a surface says at all. It is here, beside the
 * recipe, because the page reads it and must not load the connectors.
 */

import type { MockPlan, MockPlanState } from "../connectors/types.js";
import type { FlagValue, MockIdentity, MockState } from "./recipe.js";

type Planned = Exclude<MockPlanState, "none">;

/**
 * One suggestion: a state and the calls it would put in it, and the flags and
 * identity the sentence also named. A sentence naming only a flag or a role
 * has no state and no calls.
 */
export interface MockSuggestion {
  readonly state?: MockState;
  readonly calls: readonly string[];
  readonly flags?: Readonly<Record<string, FlagValue>>;
  readonly as?: MockIdentity;
}

/** What a plan leaves a surface to say. */
export interface PlanReading {
  readonly suggestions: readonly MockSuggestion[];
  /** True when the sentence was read, confidently, as naming nothing to set. */
  readonly unnamed: boolean;
}

/** Below this the plan is a shrug, and a shrug is said as nothing. */
export const PLAN_FLOOR = 0.4;

/** Two states this close are both offered, rather than one guessed. */
export const PLAN_TIE = 0.15;

const NOTHING: PlanReading = { suggestions: [], unnamed: false };

/** The layers a suggestion carries: a concerned flag, a role at even odds or better. */
type Layers = Pick<MockSuggestion, "as" | "flags">;

/**
 * The calm-UI gate the box and `maple mock plan` share. Under
 * {@link PLAN_FLOOR}, no state; a runner-up within {@link PLAN_TIE}, two; a
 * state no call is in, none. Named flags and a named role ride on each, or
 * are a suggestion of their own; `none` with neither is unnamed.
 */
export function readPlan(plan: MockPlan | null): PlanReading {
  if (plan === null) return NOTHING;
  const layers = layersOf(plan);
  const states = statesOf(plan);
  if (states.length > 0) {
    const calls = plan.calls.filter((call) => call.concerned).map((call) => call.key);
    return { suggestions: states.map((state) => ({ state, calls, ...layers })), unnamed: false };
  }
  if (layers.flags !== undefined || layers.as !== undefined) {
    return { suggestions: [{ calls: [], ...layers }], unnamed: false };
  }
  const unnamed = plan.state === "none" && plan.confidence >= PLAN_FLOOR;
  return unnamed ? { suggestions: [], unnamed } : NOTHING;
}

/** The state, or the two it is torn between; none when unsure or when no call is in it. */
function statesOf(plan: MockPlan): Planned[] {
  if (plan.confidence < PLAN_FLOOR || plan.state === "none") return [];
  if (!plan.calls.some((call) => call.concerned)) return [];

  const others = (Object.keys(plan.distribution) as MockPlanState[]).filter(
    (state): state is Planned => state !== plan.state && state !== "none",
  );
  const runnerUp = others.reduce<Planned | undefined>(
    (best, state) =>
      best === undefined || plan.distribution[state] > plan.distribution[best] ? state : best,
    undefined,
  );
  const tied =
    runnerUp !== undefined &&
    plan.distribution[plan.state] - plan.distribution[runnerUp] <= PLAN_TIE;
  return tied ? [plan.state, runnerUp] : [plan.state];
}

function layersOf(plan: MockPlan): Layers {
  const named = (plan.flags ?? []).filter((flag) => flag.concerned);
  const flags = Object.fromEntries(named.map((flag) => [flag.key, flag.value]));
  const role = plan.role !== undefined && plan.role.p >= 0.5 ? plan.role.role : undefined;
  return {
    ...(named.length === 0 ? {} : { flags }),
    ...(role === undefined ? {} : { as: { role } }),
  };
}
