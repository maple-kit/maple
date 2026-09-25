/**
 * What the box does with a plan: the calm-UI gate that decides whether it
 * says anything, and the summaries a planner reads each call by. It shows
 * nothing it is unsure of, and never a number. `docs/mock.md` has the gate.
 */

import { MOCK_STATES } from "@maple-kit/core/mock";

import type { Sample } from "../inventory.js";
import type { MockPlan, MockPlanCall } from "@maple-kit/core/connectors";
import type { MockState } from "@maple-kit/core/mock";

/** One chip: a state, and the calls it would put in it. */
export interface MockSuggestion {
  readonly state: MockState;
  readonly calls: readonly string[];
}

/** What a plan leaves the box to draw. */
export interface PlanReading {
  readonly suggestions: readonly MockSuggestion[];
  /** True when the sentence was read, confidently, as naming no state. */
  readonly unnamed: boolean;
}

/** Below this the plan is a shrug, and a shrug is drawn as nothing. */
export const PLAN_FLOOR = 0.4;

/** Two states this close are both offered, rather than one guessed. */
export const PLAN_TIE = 0.15;

/** Long enough that a sentence is not planned three times as it is typed. */
export const PLAN_DEBOUNCE_MS = 500;

/** Nothing plans a fragment this short usefully. */
export const PLAN_MIN_LENGTH = 4;

const NOTHING: PlanReading = { suggestions: [], unnamed: false };

/**
 * The calm-UI gate. Under {@link PLAN_FLOOR}, nothing; `none`, the sentence
 * names no state; the runner-up within {@link PLAN_TIE}, two chips.
 */
export function readPlan(plan: MockPlan | null): PlanReading {
  if (plan === null || plan.confidence < PLAN_FLOOR) return NOTHING;
  if (plan.state === "none") return { suggestions: [], unnamed: true };

  const calls = plan.calls.filter((call) => call.concerned).map((call) => call.key);
  if (calls.length === 0) return NOTHING;

  const top = plan.distribution[plan.state];
  const runnerUp = MOCK_STATES.filter((state) => state !== plan.state).reduce<
    MockState | undefined
  >((best, state) => {
    if (best === undefined) return state;
    return plan.distribution[state] > plan.distribution[best] ? state : best;
  }, undefined);

  const states =
    runnerUp !== undefined && top - plan.distribution[runnerUp] <= PLAN_TIE
      ? [plan.state, runnerUp]
      : [plan.state];
  return { suggestions: states.map((state) => ({ state, calls })), unnamed: false };
}

/** How deep and how wide a summary reads a recorded body. */
const DEPTH = 2;
const FIELDS = 12;

/**
 * A recorded call as a planner reads it: the names in its last answer, never
 * a value. The route adds what the call's schema says, where it has one.
 */
export function planCall(sample: Sample): MockPlanCall {
  return { key: sample.key, summary: namesIn(sample.body, 0) };
}

function namesIn(value: unknown, depth: number): string {
  if (depth > DEPTH) return "";
  if (Array.isArray(value)) {
    const item = namesIn(value[0], depth + 1);
    return item === "" ? "list" : `list of [${item}]`;
  }
  if (typeof value !== "object" || value === null) return "";

  return Object.entries(value)
    .slice(0, FIELDS)
    .map(([name, inner]) => {
      if (!Array.isArray(inner)) return name;
      const item = namesIn(inner[0], depth + 1);
      return item === "" ? name : `${name} [${item}]`;
    })
    .join(", ");
}
