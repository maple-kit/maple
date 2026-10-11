/**
 * `maple lint --url=<preview> --tokens=<css>`: the design-system lint, run
 * locally. Exits 1 when a finding is an error, which is the verdict
 * `maple ci lint` publishes for the same preview. A lint config file adds the
 * judged tier.
 */

import { describePlace, groupByRule, lintRendered, verdictFor } from "@maple-kit/lint";

import { isSet } from "../args.js";
import { DEFAULT_BASE, gitChangedFiles } from "../changed-files.js";
import { describeJudgedStats } from "../judged-notes.js";
import { judgedFrom } from "../judged-rules.js";

import type { FlagSpec, ParsedArgs } from "../args.js";
import type { ConnectRules } from "../judged-rules.js";
import type { Finding } from "@maple-kit/core";
import type { JudgedStats, RenderedLintOptions, Viewport } from "@maple-kit/lint";

/** The flags `maple lint` and `maple ci lint` share. */
export const SHARED_LINT_FLAGS = {
  url: "string",
  tokens: "strings",
  viewport: "strings",
  config: "string",
} as const satisfies FlagSpec;

export const LINT_FLAGS = { ...SHARED_LINT_FLAGS, changed: "optional" } as const satisfies FlagSpec;

export const LINT_USAGE = `Usage
  maple lint --url=<preview> [--tokens=<file.css>]... [--viewport=<W>x<H>]...
                [--config=<file>] [--changed[=<base>]] [--json]

  --url       The preview to lint.
  --tokens    A CSS file the design tokens are read from. Repeat for several.
  --viewport  A size to judge at, such as 375x812. Repeat for several; the
              default is a phone, a tablet and a laptop.
  --config    A TypeScript file whose default export is
              defineLintConfig({ rules, maxPerRule?, maxTargets?, maxHtml? }),
              from @maple-kit/cli. Defaults to maple.lint.config.ts in the
              working directory. A rule is { id, question, appliesTo,
              severity? }: a "yes" answer is a violation and appliesTo is a
              CSS selector. Needs TYPESAFE_API_KEY. With no config file the
              judged tier is off. A broken one is an error.
  --changed   Judge the elements from files changed since <base> first, and
              skip the rest (the diff of <base>...HEAD). The base defaults to
              origin/main. Off by default.

  Exits 1 when any finding is an error.`;

/** What the command prints, and its exit code. */
export interface LintResult {
  readonly output: string;
  readonly exitCode: number;
}

/** The lint, as a test supplies it in place of a browser. */
export type RunLint = (options: RenderedLintOptions) => Promise<{
  readonly findings: readonly Finding[];
  readonly judgedErrors?: readonly string[];
  readonly judgedStats?: JudgedStats;
}>;

/** What both lint commands read from their flags. */
export interface LintInputs {
  readonly url: string;
  readonly tokenFiles: readonly string[];
  readonly viewports?: readonly Viewport[];
  /** `--config`, which is read later, where the environment is known. */
  readonly config?: string;
  /** `--changed`: the base to diff against, empty for the default. */
  readonly changed?: string;
}

/** What the judged tier reads from outside, which a test supplies. */
export interface Judging {
  readonly env?: NodeJS.ProcessEnv;
  readonly connect?: ConnectRules;
  /** The files changed since a base, in place of the real diff. */
  readonly changedFiles?: (base: string, cwd: string) => Promise<readonly string[]>;
}

/** The values of a flag that may repeat, however many times it was given. */
export function valuesOf(flags: ParsedArgs["flags"], name: string): readonly string[] {
  const value = flags[name];
  if (Array.isArray(value)) return value as readonly string[];
  return typeof value === "string" ? [value] : [];
}

/** `375x812` as a viewport, or undefined for anything else. */
function viewportOf(text: string): Viewport | undefined {
  const match = /^(\d+)x(\d+)$/i.exec(text.trim());
  if (match === null) return undefined;
  const [width, height] = [Number(match[1]), Number(match[2])];
  return width > 0 && height > 0 ? { width, height } : undefined;
}

/** The inputs both commands share, or the sentence saying which is wrong. */
export function readInputs(flags: ParsedArgs["flags"]): LintInputs | { readonly error: string } {
  const url = flags["url"];
  if (typeof url !== "string" || url.trim() === "") return { error: "--url is required." };

  const given = valuesOf(flags, "viewport");
  const viewports = given.map(viewportOf);
  const bad = given.find((_, index) => viewports[index] === undefined);
  if (bad !== undefined) return { error: `--viewport must look like 375x812, not "${bad}".` };

  return {
    url: url.trim(),
    tokenFiles: valuesOf(flags, "tokens"),
    ...(typeof flags["config"] === "string" && flags["config"].trim() !== ""
      ? { config: flags["config"].trim() }
      : {}),
    ...(typeof flags["changed"] === "string" ? { changed: flags["changed"].trim() } : {}),
    ...(given.length === 0 ? {} : { viewports: viewports as Viewport[] }),
  };
}

/** What the judged tier did not check, for the terminal. */
export interface JudgedReport {
  readonly errors?: readonly string[];
  readonly stats?: JudgedStats | undefined;
}

/** The findings grouped by rule, each with the `file:line:col` it anchors to. */
export function renderFindings(
  findings: readonly Finding[],
  root?: string,
  { errors = [], stats }: JudgedReport = {},
): string {
  const notes = [
    ...errors.map((line) => `Judged tier unchecked, not clean: ${line}`),
    ...(stats === undefined ? [] : describeJudgedStats(stats)),
  ];
  if (findings.length === 0) return ["No design findings.", ...notes].join("\n");
  const lines: string[] = [];
  for (const [rule, group] of groupByRule(findings)) {
    lines.push(`${rule} (${String(group.length)})`);
    for (const found of group) {
      const place = describePlace(found, root);
      const where = place === "" ? "" : `${place}  `;
      lines.push(`  ${where}[${found.severity}] ${found.message}`);
    }
    lines.push("");
  }
  lines.push(verdictFor(findings, root).title, ...notes);
  return lines.join("\n");
}

/** Runs the command. */
export async function lint(
  { flags }: ParsedArgs,
  run: RunLint = lintRendered,
  root: string = process.cwd(),
  { env = process.env, connect, changedFiles = gitChangedFiles }: Judging = {},
): Promise<LintResult> {
  const inputs = readInputs(flags);
  if ("error" in inputs)
    return { output: `maple lint: ${inputs.error}\n\n${LINT_USAGE}`, exitCode: 1 };

  let findings: readonly Finding[];
  let judgedErrors: readonly string[];
  let judgedStats: JudgedStats | undefined;
  try {
    const { config, changed, ...options } = inputs;
    const setup = await judgedFrom({ config, root, env }, connect);
    if (setup.skipped !== undefined) return { output: `maple lint: ${setup.skipped}`, exitCode: 1 };
    const sources =
      setup.judged && changed !== undefined
        ? { sources: await changedFiles(changed === "" ? DEFAULT_BASE : changed, root) }
        : {};
    const judged = setup.judged ? { judged: { ...setup.judged, ...sources } } : {};
    const found = await run({ ...options, ...judged });
    findings = found.findings;
    judgedErrors = found.judgedErrors ?? [];
    judgedStats = found.judgedStats;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { output: `maple lint: ${reason}`, exitCode: 1 };
  }

  const { conclusion } = verdictFor(findings, root);
  const json = isSet(flags, "json");
  return {
    output: json
      ? JSON.stringify({ conclusion, findings, judgedErrors, judgedStats }, null, 2)
      : renderFindings(findings, root, { errors: judgedErrors, stats: judgedStats }),
    exitCode: conclusion === "failure" ? 1 : 0,
  };
}
