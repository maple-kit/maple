/**
 * The lint config file: `maple.lint.config.ts`, whose default export is a
 * `defineLintConfig({ rules, ... })`. Node 24 strips the types as it imports,
 * so a host needs no loader. Only erasable TypeScript syntax is allowed.
 */

import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { Rule, Severity } from "@maple-kit/core/connectors";

/** Where `maple lint` looks when `--config` is not given, relative to the working directory. */
export const DEFAULT_LINT_CONFIG = "maple.lint.config.ts";

/** What the config file exports. The three caps are the ones `lintRendered` takes. */
export interface LintConfig {
  /** The judged rules. A "yes" answer to `question` is a violation. */
  readonly rules: readonly Rule[];
  /** Elements judged per rule, after identical components are collapsed. */
  readonly maxPerRule?: number;
  /** Elements judged per page. */
  readonly maxTargets?: number;
  /** Characters of HTML sent per element. */
  readonly maxHtml?: number;
}

/** Types the config file's export; returns it unchanged. */
export function defineLintConfig(config: LintConfig): LintConfig {
  return config;
}

const SEVERITIES: readonly string[] = ["advice", "warn", "error"];
const CAPS = ["maxPerRule", "maxTargets", "maxHtml"] as const;

function fail(path: string, detail: string): never {
  throw new Error(`lint config ${path}: ${detail}`);
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

function capsOf(path: string, file: Record<string, unknown>): Partial<LintConfig> {
  const caps: Partial<Record<(typeof CAPS)[number], number>> = {};
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

/** Checks what a config file exported, throwing a sentence naming the file and the fault. */
export function validateLintConfig(path: string, exported: unknown): LintConfig {
  if (!isRecord(exported) || !Array.isArray(exported["rules"]) || exported["rules"].length === 0) {
    return fail(path, 'the default export needs a non-empty "rules" array.');
  }
  const rules = (exported["rules"] as unknown[]).map((entry, index) => ruleOf(path, entry, index));
  const repeated = rules.find((rule, index) => rules.findIndex((r) => r.id === rule.id) !== index);
  if (repeated !== undefined) return fail(path, `rule id "${repeated.id}" appears twice.`);
  return { rules, ...capsOf(path, exported) };
}

/** True when `path` exists. */
async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads the config. `given` is `--config`; without it the default file is
 * used if it exists, and `undefined` means there is none, so no judged tier.
 * A file that was asked for but is missing, or is broken, throws.
 */
export async function loadLintConfig(
  given: string | undefined,
  root: string,
): Promise<LintConfig | undefined> {
  const path = resolve(root, given ?? DEFAULT_LINT_CONFIG);
  if (!(await exists(path))) {
    if (given === undefined) return undefined;
    return fail(given, "no such file.");
  }
  let exported: unknown;
  try {
    exported = ((await import(pathToFileURL(path).href)) as { default?: unknown }).default;
  } catch (error) {
    return fail(
      given ?? DEFAULT_LINT_CONFIG,
      error instanceof Error ? error.message : String(error),
    );
  }
  return validateLintConfig(given ?? DEFAULT_LINT_CONFIG, exported);
}
