/**
 * The flags and the role in a plan request and its answer. The page lists
 * the flags it evaluated; the roles are the host's own identity rules, never
 * the page's. An answer is kept to what was listed, whatever the model said.
 */

import { flagValues } from "../connectors/plan.js";

import type { MockPlan, MockPlanFlag, MockPlanRequest } from "../connectors/types.js";
import type { IdentityRules } from "../mock/identity.js";
import type { FlagValue } from "../mock/recipe.js";

/** Flags planned per request unless the host says otherwise. */
export const DEFAULT_FLAG_LIMIT = 100;
const MAX_VARIANTS = 20;
const MAX_WORD = 100;
const TYPES: ReadonlySet<string> = new Set(["boolean", "number", "object", "string"]);

/** Why a flag was dropped, as the warning says it. */
type Dropped = "key" | "type" | "value" | "variants";

const REASONS: Readonly<Record<Dropped, string>> = {
  key: "an unusable key",
  type: "an unknown type",
  value: "a value that is too long",
  variants: "too many variants",
};

/** The flags a request lists, and a plain sentence for each thing that was left out. */
export interface PlanFlags {
  readonly flags?: MockPlanFlag[];
  readonly warnings: string[];
  readonly error?: string;
}

/**
 * The flags a request lists: each valid one, the most relevant to the
 * sentence first, kept up to `limit`. A flag a plan could not set is dropped
 * on its own and counted. Absent is none; a value that is no list is an error.
 */
export function readPlanFlags(
  value: unknown,
  sentence = "",
  limit = DEFAULT_FLAG_LIMIT,
): PlanFlags {
  if (value === undefined) return { flags: [], warnings: [] };
  if (!Array.isArray(value))
    return { error: "flags: a list of { key, type, variants? }", warnings: [] };
  const dropped = new Map<Dropped, number>();
  const valid: MockPlanFlag[] = [];
  for (const item of value) {
    const read = readFlag(item);
    if ("reason" in read) dropped.set(read.reason, (dropped.get(read.reason) ?? 0) + 1);
    else if (flagValues(read.flag).length > 0) valid.push(read.flag);
  }
  const flags = kept(valid, sentence, limit);
  const warnings = [...dropped].map(
    ([reason, count]) => `flags: ${String(count)} dropped (${REASONS[reason]})`,
  );
  if (flags.length < valid.length) {
    warnings.unshift(`flags: planned ${String(flags.length)} of ${String(valid.length)}`);
  }
  return { flags, warnings };
}

/** Flags sharing a word with the sentence first, then the latest sent, up to `limit`. */
function kept(flags: readonly MockPlanFlag[], sentence: string, limit: number): MockPlanFlag[] {
  if (flags.length <= limit) return [...flags];
  const wanted = new Set(words(sentence));
  const latest = flags.map((flag, index) => ({ flag, index })).reverse();
  const hit = (flag: MockPlanFlag) => words(flag.key).some((word) => wanted.has(word));
  const ranked = [
    ...latest.filter((one) => hit(one.flag)),
    ...latest.filter((one) => !hit(one.flag)),
  ];
  return ranked
    .slice(0, Math.max(0, limit))
    .sort((a, b) => a.index - b.index)
    .map((one) => one.flag);
}

/** Lowercase words of three characters or more, split on `-_.:/`, spaces and camelCase. */
function words(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3);
}

type Read = { flag: MockPlanFlag } | { reason: Dropped };

function readFlag(value: unknown): Read {
  if (!isRecord(value)) return { reason: "key" };
  const { key, type, variants } = value;
  if (typeof key !== "string" || key === "") return { reason: "key" };
  if (key.length > MAX_WORD) return { reason: "key" };
  if (typeof type !== "string" || !TYPES.has(type)) return { reason: "type" };
  const flag = { key, type: type as MockPlanFlag["type"] };
  if (variants === undefined) return { flag };
  if (!Array.isArray(variants) || variants.length > MAX_VARIANTS) return { reason: "variants" };
  return variants.every(isWord)
    ? { flag: { ...flag, variants: variants as FlagValue[] } }
    : { reason: "value" };
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
