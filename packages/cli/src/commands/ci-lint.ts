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
import { runCiLint } from "../ci-lint.js";
import { LINT_FLAGS, readInputs, renderFindings } from "./lint.js";

import type { FlagSpec, ParsedArgs } from "../args.js";
import type { CiLintDeps, CiLintOptions, CiLintResult } from "../ci-lint.js";

export const CI_LINT_FLAGS = {
  ...LINT_FLAGS,
  sarif: "string",
  repo: "string",
  sha: "string",
  "app-id": "string",
  "dry-run": "boolean",
} as const satisfies FlagSpec;

export const CI_LINT_USAGE = `Usage
  maple ci lint --url=<preview> [--tokens=<file.css>]... [--viewport=<W>x<H>]...
                [--sarif=<path>] [--repo=<owner/name>] [--sha=<sha>] [--dry-run]

  Lints the preview, writes SARIF to --sarif, and publishes the maple/design-lint
  check run on the head commit.

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

/** The pull request's head commit from the event payload, which `GITHUB_SHA` is not. */
async function headFromEvent(path: string | undefined): Promise<string | undefined> {
  if (path === undefined || path === "") return undefined;
  try {
    const event = JSON.parse(await readFile(path, "utf8")) as {
      pull_request?: { head?: { sha?: unknown } };
    };
    const sha = event.pull_request?.head?.sha;
    return typeof sha === "string" ? sha : undefined;
  } catch {
    return undefined;
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
    text(flags, "sha") ?? (await headFromEvent(env["GITHUB_EVENT_PATH"])) ?? env["GITHUB_SHA"];
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
    ...(result.sarifPath === undefined ? [] : [`sarif-path=${result.sarifPath}`]),
    ...(result.checkRunId === undefined ? [] : [`check-run-id=${String(result.checkRunId)}`]),
  ];
  await appendFile(path, `${lines.join("\n")}\n`);
}

function describe(result: CiLintResult, dryRun: boolean): string {
  const lines = [renderFindings(result.findings), "", `maple/design-lint: ${result.conclusion}`];
  if (result.sarifPath !== undefined) lines.push(`SARIF written to ${result.sarifPath}`);
  if (result.checkRunId !== undefined)
    lines.push(`Check run ${String(result.checkRunId)} published`);
  if (dryRun) lines.push("Dry run: nothing was published.");
  return lines.join("\n");
}

/** Runs the command. */
export async function ciLint(
  { flags }: ParsedArgs,
  { env = process.env, ...deps }: CiLintEnvironment = {},
): Promise<CiLintCommandResult> {
  const failed = (reason: string): CiLintCommandResult => ({
    output: `maple ci lint: ${reason}\n\n${CI_LINT_USAGE}`,
    exitCode: 1,
  });
  const inputs = readInputs(flags);
  if ("error" in inputs) return failed(inputs.error);

  const dryRun = isSet(flags, "dry-run");
  const publish = dryRun ? undefined : await publishTarget(flags, env);
  if (typeof publish === "string") return failed(publish);

  const sarif = text(flags, "sarif");
  const baseUrl = env["GITHUB_API_URL"];
  let result: CiLintResult;
  try {
    result = await runCiLint(
      {
        ...inputs,
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
