/**
 * The judged lint tier as the command line wires it: a rules file, jev as the
 * judge, and the key from the environment.
 *
 * No rules file means no judged tier. Rules without a key are `skipped`, which
 * `maple lint` reports as an error and `maple ci lint` notes in its summary.
 */

import { readFile } from "node:fs/promises";

import type { Rule, RuleConnector, Severity } from "@maple-kit/core/connectors";
import type { JudgedOptions } from "@maple-kit/lint";

/** Builds the judge from the rules and the environment. Tests supply a fake. */
export type ConnectRules = (
  rules: readonly Rule[],
  env: NodeJS.ProcessEnv,
) => Promise<RuleConnector | undefined>;

/** What `--rules` resolved to. Neither field set is a run without the judged tier. */
export interface JudgedSetup {
  readonly judged?: JudgedOptions;
  /** Why the tier did not run although rules were given. */
  readonly skipped?: string;
}

const SEVERITIES: readonly string[] = ["advice", "warn", "error"];
const CAPS = ["maxPerRule", "maxTargets", "maxHtml"] as const;

type Caps = Partial<Record<(typeof CAPS)[number], number>>;

function fail(path: string, detail: string): never {
  throw new Error(`--rules ${path}: ${detail}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function word(path: string, where: string, entry: Record<string, unknown>, key: string): string {
  const value = entry[key];
  if (typeof value !== "string" || value.trim() === "") {
    return fail(path, `${where} needs a non-empty "${key}".`);
  }
  return value;
}

function ruleOf(path: string, entry: unknown, index: number): Rule {
  const where = `rule ${String(index + 1)}`;
  if (!isRecord(entry)) return fail(path, `${where} must be an object.`);
  const severity = entry["severity"];
  if (severity !== undefined && (typeof severity !== "string" || !SEVERITIES.includes(severity))) {
    return fail(path, `${where} has an invalid severity; use advice, warn or error.`);
  }
  return {
    id: word(path, where, entry, "id"),
    question: word(path, where, entry, "question"),
    appliesTo: word(path, where, entry, "appliesTo"),
    ...(severity === undefined ? {} : { severity: severity as Severity }),
  };
}

function capsOf(path: string, file: Record<string, unknown>): Caps {
  const caps: Caps = {};
  for (const key of CAPS) {
    const value = file[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      return fail(path, `"${key}" must be a positive whole number.`);
    }
    caps[key] = value;
  }
  return caps;
}

/**
 * Reads a rules file: `{ "rules": [...], "maxPerRule"?, "maxTargets"?, "maxHtml"? }`,
 * or the bare array of rules. Throws a sentence naming the file and the fault.
 */
export async function readRulesFile(
  path: string,
): Promise<{ readonly rules: readonly Rule[]; readonly caps: Caps }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    return fail(path, error instanceof Error ? error.message : String(error));
  }
  const file = Array.isArray(parsed) ? { rules: parsed as unknown } : parsed;
  if (!isRecord(file) || !Array.isArray(file["rules"]) || file["rules"].length === 0) {
    return fail(path, 'expected a non-empty "rules" array.');
  }
  const rules = (file["rules"] as unknown[]).map((entry, index) => ruleOf(path, entry, index));
  const repeated = rules.find((rule, index) => rules.findIndex((r) => r.id === rule.id) !== index);
  if (repeated !== undefined) return fail(path, `rule id "${repeated.id}" appears twice.`);
  return { rules, caps: capsOf(path, file) };
}

/** jev, loaded only when rules are given, so the classifier's peers matter only then. */
export const connectJev: ConnectRules = async (rules, env) => {
  const apiKey = env["TYPESAFE_API_KEY"];
  if (apiKey === undefined || apiKey === "") return undefined;
  let classifier: typeof import("@maple-kit/classifier");
  try {
    classifier = await import("@maple-kit/classifier");
  } catch {
    throw new Error(
      "the judged tier needs @maple-kit/classifier and its peers (effect, @effect/ai-typesafe); install them next to @maple-kit/cli.",
    );
  }
  const model = env["MAPLE_AI_MODEL"];
  const baseUrl = env["MAPLE_AI_API"];
  return classifier.jevRules({
    apiKey,
    rules,
    ...(model === undefined || model === "" ? {} : { model }),
    ...(baseUrl === undefined || baseUrl === "" ? {} : { baseUrl }),
  });
};

/** Resolves `--rules` into the judged tier, or into the reason it is off. */
export async function judgedFrom(
  rulesPath: string | undefined,
  env: NodeJS.ProcessEnv,
  connect: ConnectRules = connectJev,
): Promise<JudgedSetup> {
  if (rulesPath === undefined) return {};
  const { rules, caps } = await readRulesFile(rulesPath);
  const connector = await connect(rules, env);
  if (connector === undefined) {
    return { skipped: "TYPESAFE_API_KEY is not set, so the rules in --rules were not judged." };
  }
  return { judged: { connector, ...caps } };
}
