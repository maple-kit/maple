/**
 * `runCiLint`: the design lint as CI runs it, which is what `maple ci lint`
 * and `maple-action`'s lint mode both call.
 *
 * Lints the preview, writes SARIF, and publishes `maple/design-lint` when it
 * is given somewhere to publish. A preview that cannot be loaded is neutral:
 * nothing was judged, so nothing should block, the same exit semantics as the
 * visual-review gate.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  lintRendered,
  publishCheckRun,
  toSarif,
  unreachableVerdict,
  verdictFor,
} from "@maple-kit/lint";

import type { Finding } from "@maple-kit/core";
import type { JudgedOptions, RenderedLintOptions, Verdict, Viewport } from "@maple-kit/lint";

/** Where a verdict is published. Omitted from {@link CiLintOptions} for a dry run. */
export interface CiLintPublish {
  /** From the environment at the call site, never from argv. */
  readonly token: string;
  readonly owner: string;
  readonly repo: string;
  readonly headSha: string;
  /** The App's own id, as `githubGate` uses it for `maple/visual-review`. */
  readonly appId?: number;
}

/** What a CI lint run is given. */
export interface CiLintOptions {
  /** The preview's URL. */
  readonly url: string;
  /** CSS files the token set is read from. */
  readonly tokenFiles: readonly string[];
  readonly viewports?: readonly Viewport[];
  readonly bypassHeaders?: Readonly<Record<string, string>>;
  /** Puts the page's rules to a judge too. Omitted, the judged tier is off. */
  readonly judged?: JudgedOptions;
  /** Why rules were given but not judged, which the summary says rather than hiding. */
  readonly judgedSkipped?: string;
  /** Where to write the SARIF log. Not written when omitted. */
  readonly sarifPath?: string;
  /** Where to publish the check run. Omitted, the run is a dry run. */
  readonly publish?: CiLintPublish;
}

/** What a CI lint run concluded. */
export interface CiLintResult {
  readonly conclusion: "failure" | "neutral" | "success";
  readonly findings: readonly Finding[];
  /** One line per viewport the judge rejected: unchecked, not clean. */
  readonly judgedErrors: readonly string[];
  /** Set when rules were given and the judged tier did not run. */
  readonly judgedSkipped?: string;
  readonly sarifPath?: string;
  readonly checkRunId?: number;
}

/** What a run needs from outside, which a test supplies and a CI run does not. */
export interface CiLintDeps {
  /** Defaults to the rendered tier from `@maple-kit/lint`. */
  readonly lint?: (options: RenderedLintOptions) => Promise<{
    readonly findings: readonly Finding[];
    readonly judgedErrors?: readonly string[];
  }>;
  readonly fetch?: typeof fetch;
  /** Defaults to `https://api.github.com`. Set for Enterprise Server. */
  readonly baseUrl?: string;
  /** The checkout, for paths a tagged build recorded as absolute. Defaults to the working directory. */
  readonly root?: string;
}

/** Playwright's own words for a page that never loaded, as opposed to a run that is broken. */
const UNREACHABLE = /page\.goto|net::ERR_|Timeout \d+ms exceeded/;

/** True when `error` is the preview not answering, which is neutral and not a failure. */
export function isUnreachable(error: unknown): boolean {
  return error instanceof Error && UNREACHABLE.test(error.message);
}

function lintOptions(options: CiLintOptions): RenderedLintOptions {
  return {
    url: options.url,
    tokenFiles: options.tokenFiles,
    ...(options.viewports === undefined ? {} : { viewports: options.viewports }),
    ...(options.bypassHeaders === undefined ? {} : { bypassHeaders: options.bypassHeaders }),
    ...(options.judged === undefined ? {} : { judged: options.judged }),
  };
}

/**
 * Says what the judged tier did not check. The conclusion is untouched: a judge
 * that was down or never configured must not block a merge, but "no findings"
 * beside it would read as clean.
 */
export function withJudgedNotes(
  verdict: Verdict,
  judgedErrors: readonly string[],
  skipped?: string,
): Verdict {
  const notes: string[] = [];
  if (judgedErrors.length > 0) {
    notes.push(
      "### Judged tier: unchecked, not clean",
      "",
      "The judge failed at these viewports, so the rules were not checked there:",
      "",
      ...judgedErrors.map((line) => `- ${line}`),
    );
  }
  if (skipped !== undefined) notes.push("### Judged tier: skipped", "", skipped);
  if (notes.length === 0) return verdict;
  return {
    ...verdict,
    title: `${verdict.title} (judged tier unchecked)`,
    summary: `${verdict.summary}\n\n${notes.join("\n")}`,
  };
}

async function judge(
  options: CiLintOptions,
  deps: CiLintDeps,
  root: string,
): Promise<{ findings: readonly Finding[]; judgedErrors: readonly string[]; verdict: Verdict }> {
  try {
    const run = await (deps.lint ?? lintRendered)(lintOptions(options));
    const judgedErrors = run.judgedErrors ?? [];
    const verdict = withJudgedNotes(
      verdictFor(run.findings, root),
      judgedErrors,
      options.judgedSkipped,
    );
    return { findings: run.findings, judgedErrors, verdict };
  } catch (error) {
    if (!isUnreachable(error)) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    return { findings: [], judgedErrors: [], verdict: unreachableVerdict(options.url, reason) };
  }
}

async function writeSarif(path: string, findings: readonly Finding[], root: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(toSarif(findings, { root }), null, 2)}\n`);
}

/**
 * Runs the lint, writes SARIF to `sarifPath` and publishes the check run to
 * `publish`, each only when given. Throws when GitHub refuses the check or the
 * run itself breaks; only an unreachable preview is a neutral result.
 */
export async function runCiLint(
  options: CiLintOptions,
  deps: CiLintDeps = {},
): Promise<CiLintResult> {
  const root = deps.root ?? process.cwd();
  const { findings, judgedErrors, verdict } = await judge(options, deps, root);

  if (options.sarifPath !== undefined) await writeSarif(options.sarifPath, findings, root);

  const checkRunId =
    options.publish === undefined
      ? undefined
      : await publishCheckRun(
          {
            ...options.publish,
            root,
            ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
            ...(deps.baseUrl === undefined ? {} : { baseUrl: deps.baseUrl }),
          },
          verdict,
          findings,
        );

  return {
    conclusion: verdict.conclusion,
    findings,
    judgedErrors,
    ...(options.judgedSkipped === undefined ? {} : { judgedSkipped: options.judgedSkipped }),
    ...(options.sarifPath === undefined ? {} : { sarifPath: options.sarifPath }),
    ...(checkRunId === undefined ? {} : { checkRunId }),
  };
}
