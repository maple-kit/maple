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

import type { Finding, RenderedLintOptions, Verdict, Viewport } from "@maple-kit/lint";

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
  /** Where to write the SARIF log. Not written when omitted. */
  readonly sarifPath?: string;
  /** Where to publish the check run. Omitted, the run is a dry run. */
  readonly publish?: CiLintPublish;
}

/** What a CI lint run concluded. */
export interface CiLintResult {
  readonly conclusion: "failure" | "neutral" | "success";
  readonly findings: readonly Finding[];
  readonly sarifPath?: string;
  readonly checkRunId?: number;
}

/** What a run needs from outside, which a test supplies and a CI run does not. */
export interface CiLintDeps {
  /** Defaults to the rendered tier from `@maple-kit/lint`. */
  readonly lint?: (
    options: RenderedLintOptions,
  ) => Promise<{ readonly findings: readonly Finding[] }>;
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
  };
}

async function judge(
  options: CiLintOptions,
  deps: CiLintDeps,
  root: string,
): Promise<{ findings: readonly Finding[]; verdict: Verdict }> {
  try {
    const run = await (deps.lint ?? lintRendered)(lintOptions(options));
    return { findings: run.findings, verdict: verdictFor(run.findings, root) };
  } catch (error) {
    if (!isUnreachable(error)) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    return { findings: [], verdict: unreachableVerdict(options.url, reason) };
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
  const { findings, verdict } = await judge(options, deps, root);

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
    ...(options.sarifPath === undefined ? {} : { sarifPath: options.sarifPath }),
    ...(checkRunId === undefined ? {} : { checkRunId }),
  };
}
