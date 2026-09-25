/**
 * The flags and the role in a plan request and its answer. The page lists
 * the flags it evaluated; the roles are the host's own identity rules, never
 * the page's. An answer is kept to what was listed, whatever the model said.
 */

import { flagValues } from "../connectors/plan.js";

import type { MockPlan, MockPlanFlag, MockPlanRequest } from "../connectors/types.js";
import type { IdentityRules } from "../mock/identity.js";
import type { FlagValue } from "../mock/recipe.js";

/** As many flags as calls, and a short list of short values each. */
const MAX_FLAGS = 100;
const MAX_VARIANTS = 20;
const MAX_WORD = 100;
const TYPES: ReadonlySet<string> = new Set(["boolean", "number", "object", "string"]);

/**
 * The flags a request lists, less any a plan could not set, or the reason
 * they are not flags. Absent is none.
 */
export function readPlanFlags(value: unknown): { flags?: MockPlanFlag[]; error?: string } {
  if (value === undefined) return { flags: [] };
  const error = `flags: a list of at most ${String(MAX_FLAGS)} { key, type, variants? }`;
  if (!Array.isArray(value) || value.length > MAX_FLAGS) return { error };
  const flags = value.map(readFlag);
  if (flags.some((flag) => flag === undefined)) return { error };
  return { flags: (flags as MockPlanFlag[]).filter((flag) => flagValues(flag).length > 0) };
}

function readFlag(value: unknown): MockPlanFlag | undefined {
  if (!isRecord(value)) return undefined;
  const { key, type, variants } = value;
  if (typeof key !== "string" || key === "" || key.length > MAX_WORD) return undefined;
  if (typeof type !== "string" || !TYPES.has(type)) return undefined;
  const flag = { key, type: type as MockPlanFlag["type"] };
  if (variants === undefined) return flag;
  if (!Array.isArray(variants) || variants.length > MAX_VARIANTS) return undefined;
  return variants.every(isWord) ? { ...flag, variants: variants as FlagValue[] } : undefined;
}

/** A value a planner can name: a short string, a finite number, a boolean. */
function isWord(value: unknown): boolean {
  if (typeof value === "string") return value.length <= MAX_WORD;
  return typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

/** The roles the host's rules list, which are the only ones a plan may pick. */
export function planRoles(rules: IdentityRules | undefined): readonly string[] {
  return rules?.role?.values ?? [];
}

/** The plan, with a flag or role nobody listed, or a value a flag cannot take, left out. */
export function confined(plan: MockPlan, request: MockPlanRequest): MockPlan {
  const { flags: planned, role, ...rest } = plan;
  const listed = new Map((request.flags ?? []).map((flag) => [flag.key, flagValues(flag)]));
  const flags = (planned ?? []).filter((one) =>
    (listed.get(one.key) ?? []).some((value) => value === one.value),
  );
  const named = role !== undefined && (request.roles ?? []).includes(role.role);
  return {
    ...rest,
    ...(request.flags === undefined ? {} : { flags }),
    ...(named ? { role } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
