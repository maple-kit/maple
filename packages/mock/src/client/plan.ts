/**
 * What the box sends a planner: each call by the names in its last answer,
 * and when. The calm-UI gate it reads the answer through is core's
 * `readPlan`, shared with `maple mock plan`. `docs/mock.md` has both.
 */

import type { Sample } from "../inventory.js";
import type { MockPlanCall } from "@maple-kit/core/connectors";

/** Long enough that a sentence is not planned three times as it is typed. */
export const PLAN_DEBOUNCE_MS = 500;

/** Nothing plans a fragment this short usefully. */
export const PLAN_MIN_LENGTH = 4;

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
