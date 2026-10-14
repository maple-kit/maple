/**
 * `maple setup preview mirrord`: make a mirrord preview tell Maple who it is.
 * It adds `feature.env.override` to the preview config. mirrord renders the
 * values with Tera when the preview starts, from `-k` and from the CI
 * runner's own variables, so no workflow step is needed on GitHub Actions.
 */

import { spawnSync } from "node:child_process";
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, join, resolve } from "node:path";

import { isSet } from "../args.js";

import type { FlagSpec, ParsedArgs } from "../args.js";

/** What the command prints, and its exit code. */
export interface SetupPreviewResult {
  readonly output: string;
  readonly exitCode: number;
}

/** Where a config is created when the repository has none. */
export const DEFAULT_CONFIG = ".mirrord/preview.json";

/**
 * The values `feature.env.override` gets. `{{ key }}` is mirrord's template for
 * `-k`. `get_env` falls to its default only for an unset variable, and GitHub
 * sets `GITHUB_HEAD_REF` empty on a push, which is why the server also reads the
 * ref. Single quotes: an escaped double quote fails to render.
 */
export const PRESET_ENV = {
  MAPLE_PREVIEW_KEY: "{{ key }}",
  MAPLE_PULL_REQUEST: "{{ get_env(name='MAPLE_PULL_REQUEST', default='') }}",
  MAPLE_BRANCH:
    "{{ get_env(name='MAPLE_BRANCH', default=get_env(name='GITHUB_HEAD_REF', default='')) }}",
  MAPLE_REF: "{{ get_env(name='MAPLE_REF', default=get_env(name='GITHUB_REF', default='')) }}",
  MAPLE_COMMIT: "{{ get_env(name='MAPLE_COMMIT', default='') }}",
} as const;

export const SETUP_PREVIEW_FLAGS = {
  config: "string",
  write: "boolean",
} as const satisfies FlagSpec;

export const SETUP_PREVIEW_USAGE = `Usage
  maple setup preview mirrord [--config <path>] [--write]

  --config <path>  The mirrord config to edit. Default: each .mirrord/*.json that
                   is a preview config (a file name containing "preview", a
                   top-level "key" or a feature.preview section), or ${DEFAULT_CONFIG} when there is no config at all.
  --write          Edit the config instead of printing what would change.
                   Never overwrites a value that is already set.`;

type Json = Record<string, unknown>;

/** What patching one config did, and what it left for a person to decide. */
export interface Patch {
  readonly config: Json;
  readonly changes: readonly string[];
  readonly warnings: readonly string[];
}

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The object at `parent[key]`, created when absent; undefined, with a warning, when it is something else. */
function objectAt(parent: Json, key: string, path: string, warnings: string[]): Json | undefined {
  const value = parent[key];
  if (value === undefined) {
    const created: Json = {};
    parent[key] = created;
    return created;
  }
  if (isObject(value)) return value;
  warnings.push(`${path} is not an object; left alone.`);
  return undefined;
}

/** Ensures steal mode, or warns about the mode that is there. */
function ensureSteal(feature: Json, changes: string[], warnings: string[]): void {
  const network = objectAt(feature, "network", "feature.network", warnings);
  if (network === undefined) return;
  const incoming = network["incoming"];
  const mode = isObject(incoming) ? incoming["mode"] : incoming;
  if (mode === "steal") return;
  if (mode !== undefined) {
    warnings.push(
      `feature.network.incoming.mode is ${JSON.stringify(mode)}: a preview must steal, or its responses are discarded. Left alone.`,
    );
    return;
  }
  if (isObject(incoming)) incoming["mode"] = "steal";
  else network["incoming"] = { mode: "steal" };
  changes.push('feature.network.incoming.mode = "steal"');
}

/** Adds each preset variable that is not already set. */
function ensureEnv(feature: Json, changes: string[], warnings: string[]): void {
  const env = objectAt(feature, "env", "feature.env", warnings);
  const override = env && objectAt(env, "override", "feature.env.override", warnings);
  if (override === undefined) return;
  for (const [name, value] of Object.entries(PRESET_ENV)) {
    if (override[name] !== undefined) continue;
    override[name] = value;
    changes.push(`feature.env.override.${name} = ${JSON.stringify(value)}`);
  }
}

/** Applies the preset to a copy of `input`; unrelated keys are kept as they are. */
export function patchConfig(input: Json): Patch {
  const config = structuredClone(input);
  const changes: string[] = [];
  const warnings: string[] = [];
  const feature = objectAt(config, "feature", "feature", warnings);
  if (feature !== undefined) {
    ensureSteal(feature, changes, warnings);
    ensureEnv(feature, changes, warnings);
  }
  return { config, changes, warnings };
}

/** The config's own indentation, so an edit does not reflow the file. */
function indentOf(text: string): string {
  return /^([ \t]+)"/m.exec(text)?.[1] ?? "  ";
}

/** One config file, reported. */
interface FileReport {
  readonly lines: readonly string[];
  readonly failed: boolean;
}

function parseConfig(text: string): Json | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    return isObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function describeVerb(write: boolean, present: boolean): string {
  if (write) return present ? "updated" : "created";
  return present ? "would update" : "would create";
}

function processFile(path: string, label: string, write: boolean): FileReport {
  const present = existsSync(path);
  const text = present ? readFileSync(path, "utf8") : "{}";
  const current = parseConfig(text);
  if (current === undefined) {
    const why = "is not a plain JSON object (comments are not supported); edit it by hand";
    return { lines: [`${label} ${why}.`], failed: true };
  }
  const { config, changes, warnings } = patchConfig(current);
  const warned = warnings.map((warning) => `  warning: ${warning}`);
  if (changes.length === 0)
    return { lines: [`${label}: already set up.`, ...warned], failed: false };

  if (write) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(config, null, indentOf(text))}\n`);
  }
  const verb = describeVerb(write, present);
  return {
    lines: [`${label}: ${verb}`, ...changes.map((change) => `  + ${change}`), ...warned],
    failed: false,
  };
}

/** Every `.mirrord/*.json` under `cwd`, sorted. */
function listConfigs(cwd: string): string[] {
  const dir = join(cwd, dirname(DEFAULT_CONFIG));
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => join(dir, name));
}

/**
 * Whether a config is for `mirrord preview`: its file name says "preview" (the
 * key may be passed with `-k` and be absent), it states its `key`, has a
 * `feature.preview` section (a top-level `preview` does not parse), or already
 * carries this command's own override.
 */
export function looksLikePreview(config: Json, path: string): boolean {
  if (basename(path).toLowerCase().includes("preview")) return true;
  if (typeof config["key"] === "string") return true;
  const feature = config["feature"];
  if (!isObject(feature)) return false;
  if (isObject(feature["preview"])) return true;
  const env = feature["env"];
  const override = isObject(env) ? env["override"] : undefined;
  return isObject(override) && override["MAPLE_PREVIEW_KEY"] !== undefined;
}

/** Which of the `.mirrord/*.json` files are preview configs; the rest are named, not touched. */
function choose(cwd: string): { readonly targets: string[]; readonly skipped: string[] } {
  const all = listConfigs(cwd);
  if (all.length === 0) return { targets: [join(cwd, DEFAULT_CONFIG)], skipped: [] };

  const targets: string[] = [];
  const skipped: string[] = [];
  for (const path of all) {
    const parsed = parseConfig(readFileSync(path, "utf8"));
    // A file that is not plain JSON is reported where it is processed.
    if (parsed === undefined || looksLikePreview(parsed, path)) targets.push(path);
    else skipped.push(path);
  }
  return { targets, skipped };
}

/** The names `mirrord` can have in a directory: bare, or with each PATHEXT extension on Windows. */
function binaryNames(env: NodeJS.ProcessEnv): string[] {
  if (process.platform !== "win32") return ["mirrord"];
  const extensions = (env["PATHEXT"] || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);
  return extensions.flatMap((ext) => [`mirrord${ext}`, `mirrord${ext.toLowerCase()}`]);
}

/** The first executable `mirrord` on `env.PATH`, found here so the spawn takes an absolute path. */
function findMirrord(env: NodeJS.ProcessEnv): string | undefined {
  const separator = process.platform === "win32" ? ";" : delimiter;
  for (const dir of (env["PATH"] ?? "").split(separator)) {
    if (!dir) continue;
    for (const name of binaryNames(env)) {
      const candidate = join(dir, name);
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Not in this directory.
      }
    }
  }
  return undefined;
}

/** The key a verification renders `{{ key }}` with; `-k` supplies the real one at run time. */
const VERIFY_KEY = "maple-verify";

/**
 * Runs `check` on a temp copy with a literal `key` when the file's own is
 * missing or a template, which cannot render itself. The file is never touched.
 */
function withVerifyKey<T>(path: string, check: (target: string) => T): T {
  const parsed = parseConfig(readFileSync(path, "utf8"));
  const literal = typeof parsed?.["key"] === "string" && !parsed["key"].includes("{{");
  if (parsed === undefined || literal) return check(path);

  const dir = mkdtempSync(join(tmpdir(), "maple-verify-"));
  try {
    const copy = join(dir, basename(path));
    writeFileSync(copy, `${JSON.stringify({ ...parsed, key: VERIFY_KEY }, null, 2)}\n`);
    return check(copy);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** `mirrord verify-config --resolved` when the binary is on PATH; nothing when it is not. */
function verify(path: string, label: string, env: NodeJS.ProcessEnv): FileReport | undefined {
  const binary = findMirrord(env);
  if (binary === undefined) return undefined;
  const ran = withVerifyKey(path, (target) =>
    spawnSync(binary, ["verify-config", "--resolved", target], { encoding: "utf8", env }),
  );
  if (ran.error !== undefined) return undefined;

  const failure = verifyFailure(ran.stdout, ran.status);
  if (failure === undefined) return undefined;
  return { lines: [`${label}: mirrord verify-config failed.`, ...failure], failed: true };
}

/** The lines explaining a failed verification, or undefined when it passed. */
function verifyFailure(stdout: string, status: number | null): string[] | undefined {
  const reported = parseConfig(stdout);
  const errors = reported?.["errors"];
  if (reported?.["type"] === "Fail" || (reported === undefined && status !== 0)) {
    const lines = Array.isArray(errors) ? errors.map((error) => String(error)) : [];
    return (lines.length > 0 ? lines : [stdout.trim() || `exit status ${String(status)}`]).map(
      (line) => `  ${line}`,
    );
  }
  return undefined;
}

const HOST_SNIPPET = `import { mirrord } from "@maple-kit/core/preview";

createMapleHandler({ preview: mirrord({ env: process.env }), github: { owner, repo }, githubAuth });`;

const CI_NOTE = `The config reads GitHub's own variables when \`mirrord preview start\` renders it, so on GitHub Actions nothing else is needed.
On other CI, export MAPLE_PULL_REQUEST (a number) or MAPLE_BRANCH before \`mirrord preview start\`.`;

/** The relative label for a path, as the report names it. */
function labelOf(path: string, cwd: string): string {
  return path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path;
}

/** Runs the command. Nothing here exits the process. */
export function setupPreviewMirrord(
  flags: ParsedArgs["flags"],
  options: { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv } = {},
): SetupPreviewResult {
  const cwd = options.cwd ?? process.cwd();
  const config = flags["config"];
  const { targets, skipped } =
    typeof config === "string" ? { targets: [resolve(cwd, config)], skipped: [] } : choose(cwd);
  const write = isSet(flags, "write");

  const skippedLines =
    skipped.length === 0
      ? []
      : [`Skipped, not a preview config: ${skipped.map((path) => labelOf(path, cwd)).join(", ")}.`];
  if (targets.length === 0) {
    return {
      output: [
        ...skippedLines,
        'No preview config found: none is named *preview*, or has a top-level "key" or a feature.preview section.',
        "Pass --config <file> to name the one `mirrord preview start -f` uses.",
      ].join("\n"),
      exitCode: 1,
    };
  }

  const reports = targets.map((path) => processFile(path, labelOf(path, cwd), write));
  const checks = write ? verifications(targets, cwd, reports, options.env ?? process.env) : [];
  const failed = [...reports, ...checks].some((report) => report.failed);
  const first = labelOf(targets[0] ?? join(cwd, DEFAULT_CONFIG), cwd);

  const output = [
    [...reports, ...checks].flatMap((report) => report.lines).join("\n"),
    ...(skippedLines.length === 0 ? [] : [skippedLines.join("\n")]),
    `Start the preview with \`mirrord preview start -k "$KEY" -f ${first}\`.\n${CI_NOTE}`,
    `And mount Maple's preview preset on the host:\n\n${HOST_SNIPPET}`,
  ].join("\n\n");
  return { output, exitCode: failed ? 1 : 0 };
}

/** Verifies each file that was written without a parse failure. */
function verifications(
  targets: readonly string[],
  cwd: string,
  reports: readonly FileReport[],
  env: NodeJS.ProcessEnv,
): FileReport[] {
  return targets.flatMap((path, index) => {
    if (reports[index]?.failed) return [];
    const checked = verify(path, labelOf(path, cwd), env);
    return checked === undefined ? [] : [checked];
  });
}
