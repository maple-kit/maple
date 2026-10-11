/**
 * `maple ci lint`: the design lint as CI runs it. A thin shell over
 * `runCiLint`: it reads flags, falls back to the GitHub Actions environment,
 * and prints the verdict.
 *
 * The token is read from `MAPLE_GITHUB_TOKEN`, then `GITHUB_TOKEN`, and never
 * from argv, where a process listing would show it.
 */

import { appendFile, readFile } from "node:fs/promises";

import { isSet } from "../args.js";
import { pullRequestFiles } from "../changed-files.js";
import { runCiLint } from "../ci-lint.js";
import { judgedFrom } from "../judged-rules.js";
import { readInputs, renderFindings, SHARED_LINT_FLAGS } from "./lint.js";

import type { FlagSpec, ParsedArgs } from "../args.js";
import type { CiLintDeps, CiLintOptions, CiLintResult } from "../ci-lint.js";
import type { ConnectRules, JudgedSetup } from "../judged-rules.js";

export const CI_LINT_FLAGS = {
  ...SHARED_LINT_FLAGS,
  sarif: "string",
  repo: "string",
  sha: "string",
  "app-id": "string",
  "dry-run": "boolean",
} as const satisfies FlagSpec;

export const CI_LINT_USAGE = `Usage
  maple ci lint --url=<preview> [--tokens=<file.css>]... [--viewport=<W>x<H>]...
                [--config=<file>] [--sarif=<path>] [--repo=<owner/name>] [--sha=<sha>] [--dry-run]

  Lints the preview, writes SARIF to --sarif, and publishes the maple/design-lint
  check run on the head commit.

  --config   The lint config file (see maple lint --help), maple.lint.config.ts
             by default. Without one the judged tier is off; a broken one
             fails the run. Needs TYPESAFE_API_KEY: without it the check says
             the judged tier was skipped. On a pull request the elements from
             the files the PR changed are judged first (GitHub's list of the
             PR's files; if it cannot be read the check says so and judges
             without the filter). Viewports the judge failed on are listed as
             unchecked, and what was not judged is summarised; none of it
             blocks the check. Findings are advice unless a rule says
             "severity": "error".
  --repo     Defaults to GITHUB_REPOSITORY.
  --sha      Defaults to the pull request's head commit in GITHUB_EVENT_PATH,
             then GITHUB_SHA.
  --app-id   The publishing App's id, so its own in-flight run is updated.
             Defaults to MAPLE_APP_ID.
  --dry-run  Print the verdict and publish nothing.

  The token is read from MAPLE_GITHUB_TOKEN, then GITHUB_TOKEN. If the preview
  cannot be reached the check is neutral, not a failure. Exits 1 on a failure.`;

/** What the command needs from its environment. */
export interface CiLintEnvironment extends CiLintDeps {
  readonly env?: NodeJS.ProcessEnv;
  /** Builds the judge from the config's rules. Defaults to jev. */
  readonly connect?: ConnectRules;
}

/** What the command prints, and its exit code. */
export interface CiLintCommandResult {
  readonly output: string;
  readonly exitCode: number;
}

function text(flags: ParsedArgs["flags"], name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** The pull request in the event payload: its head commit, which `GITHUB_SHA` is not, and its number. */
async function pullFromEvent(
  path: string | undefined,
): Promise<{ readonly sha?: string; readonly number?: number }> {
  if (path === undefined || path === "") return {};
  try {
    const event = JSON.parse(await readFile(path, "utf8")) as {
      pull_request?: { number?: unknown; head?: { sha?: unknown } };
    };
    const { number, head } = event.pull_request ?? {};
    return {
      ...(typeof head?.sha === "string" ? { sha: head.sha } : {}),
      ...(typeof number === "number" ? { number } : {}),
    };
  } catch {
    return {};
  }
}

/** Where to publish, or the sentence naming what is missing. */
async function publishTarget(
  flags: ParsedArgs["flags"],
  env: NodeJS.ProcessEnv,
): Promise<CiLintOptions["publish"] | string> {
  const slug = text(flags, "repo") ?? env["GITHUB_REPOSITORY"] ?? "";
  const [owner = "", repo = ""] = slug.split("/");
  const headSha =
    text(flags, "sha") ?? (await pullFromEvent(env["GITHUB_EVENT_PATH"])).sha ?? env["GITHUB_SHA"];
  const token = env["MAPLE_GITHUB_TOKEN"] || env["GITHUB_TOKEN"];

  const missing = [
    owner === "" || repo === "" ? "--repo (or GITHUB_REPOSITORY)" : "",
    headSha === undefined || headSha === "" ? "--sha (or GITHUB_SHA)" : "",
    token === undefined || token === "" ? "MAPLE_GITHUB_TOKEN (or GITHUB_TOKEN)" : "",
  ].filter((name) => name !== "");
  if (missing.length > 0 || headSha === undefined || token === undefined) {
    return `to publish it needs ${missing.join(", ")}. Add --dry-run to print the verdict only.`;
  }
  const appId = Number(text(flags, "app-id") ?? env["MAPLE_APP_ID"]);
  return {
    token,
    owner,
    repo,
    headSha,
    ...(Number.isInteger(appId) && appId > 0 ? { appId } : {}),
  };
}

async function writeOutputs(path: string | undefined, result: CiLintResult): Promise<void> {
  if (path === undefined || path === "") return;
  const lines = [
    `conclusion=${result.conclusion}`,
    `findings=${String(result.findings.length)}`,
    `judged-unchecked=${String(result.judgedErrors.length)}`,
    ...(result.sarifPath === undefined ? [] : [`sarif-path=${result.sarifPath}`]),
    ...(result.checkRunId === undefined ? [] : [`check-run-id=${String(result.checkRunId)}`]),
  ];
  await appendFile(path, `${lines.join("\n")}\n`);
}

/**
 * The files the pull request changed, which the judged tier serves first.
 * Anything that stops them being read is a note, never a failure.
 */
async function changedSources(
  setup: JudgedSetup,
  flags: ParsedArgs["flags"],
  env: NodeJS.ProcessEnv,
  deps: CiLintDeps,
): Promise<{ readonly sources?: readonly string[]; readonly unfiltered?: string }> {
  if (setup.judged === undefined) return {};
  const { number } = await pullFromEvent(env["GITHUB_EVENT_PATH"]);
  if (number === undefined) return {};
  const slug = text(flags, "repo") ?? env["GITHUB_REPOSITORY"] ?? "";
  const [owner = "", repo = ""] = slug.split("/");
  const token = env["MAPLE_GITHUB_TOKEN"] || env["GITHUB_TOKEN"];
  if (owner === "" || repo === "" || token === undefined || token === "") {
    return {
      unfiltered:
        "The pull request's files were not read (no repository or token), so every matching element was judged.",
    };
  }
  const baseUrl = env["GITHUB_API_URL"];
  try {
    const sources = await pullRequestFiles({
      token,
      owner,
      repo,
      number,
      ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
      ...(baseUrl === undefined || baseUrl === "" ? {} : { baseUrl }),
    });
    return { sources };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      unfiltered: `The pull request's files could not be read (${reason}), so every matching element was judged.`,
    };
  }
}

/** What the lint config and the pull request's files add to a run's options. */
async function judgedOptions(inputs: {
  readonly config: string | undefined;
  readonly flags: ParsedArgs["flags"];
  readonly env: NodeJS.ProcessEnv;
  readonly connect: ConnectRules | undefined;
  readonly deps: CiLintDeps;
}): Promise<Partial<CiLintOptions>> {
  const { config, flags, env, connect, deps } = inputs;
  const setup = await judgedFrom({ config, root: deps.root ?? process.cwd(), env }, connect);
  const { sources, unfiltered } = await changedSources(setup, flags, env, deps);
  return {
    ...(setup.judged ? { judged: { ...setup.judged, ...(sources ? { sources } : {}) } } : {}),
    ...(setup.skipped === undefined ? {} : { judgedSkipped: setup.skipped }),
    ...(unfiltered === undefined ? {} : { judgedUnfiltered: unfiltered }),
  };
}

function describe(result: CiLintResult, dryRun: boolean): string {
  const lines = [
    renderFindings(result.findings, undefined, {
      errors: result.judgedErrors,
      stats: result.judgedStats,
    }),
    ...(result.judgedSkipped === undefined ? [] : [`Judged tier skipped: ${result.judgedSkipped}`]),
    ...(result.judgedUnfiltered === undefined ? [] : [result.judgedUnfiltered]),
    "",
    `maple/design-lint: ${result.conclusion}`,
  ];
  if (result.sarifPath !== undefined) lines.push(`SARIF written to ${result.sarifPath}`);
  if (result.checkRunId !== undefined)
    lines.push(`Check run ${String(result.checkRunId)} published`);
  if (dryRun) lines.push("Dry run: nothing was published.");
  return lines.join("\n");
}

/** Runs the command. */
export async function ciLint(
  { flags }: ParsedArgs,
  { env = process.env, connect, ...deps }: CiLintEnvironment = {},
): Promise<CiLintCommandResult> {
  const failed = (reason: string): CiLintCommandResult => ({
    output: `maple ci lint: ${reason}\n\n${CI_LINT_USAGE}`,
    exitCode: 1,
  });
  const read = readInputs(flags);
  if ("error" in read) return failed(read.error);
  const { config, ...inputs } = read;

  const dryRun = isSet(flags, "dry-run");
  const publish = dryRun ? undefined : await publishTarget(flags, env);
  if (typeof publish === "string") return failed(publish);

  const sarif = text(flags, "sarif");
  const baseUrl = env["GITHUB_API_URL"];
  let result: CiLintResult;
  try {
    const judged = await judgedOptions({ config, flags, env, connect, deps });
    result = await runCiLint(
      {
        ...inputs,
        ...judged,
        ...(sarif === undefined ? {} : { sarifPath: sarif }),
        ...(publish ? { publish } : {}),
      },
      { ...(baseUrl === undefined || baseUrl === "" ? {} : { baseUrl }), ...deps },
    );
  } catch (error) {
    return {
      output: `maple ci lint: ${error instanceof Error ? error.message : String(error)}`,
      exitCode: 1,
    };
  }

  await writeOutputs(env["GITHUB_OUTPUT"], result);
  const output = isSet(flags, "json") ? JSON.stringify(result, null, 2) : describe(result, dryRun);
  return { output, exitCode: result.conclusion === "failure" ? 1 : 0 };
}
