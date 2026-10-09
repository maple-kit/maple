/**
 * Publishing a verdict as the `maple/design-lint` check run.
 *
 * GitHub accepts fifty annotations per request, so the first fifty ride on the
 * create and the rest on updates to the same run.
 */

import { placeOf } from "./place.js";

import type { Finding, Severity } from "../types.js";
import type { Verdict } from "./verdict.js";

/** The name a branch-protection ruleset requires. */
export const DESIGN_LINT_CHECK = "maple/design-lint";

const ANNOTATIONS_PER_REQUEST = 50;
const LEVEL: Readonly<Record<Severity, string>> = {
  error: "failure",
  warn: "warning",
  advice: "notice",
};

/** Where and as whom the check is published. */
export interface CheckRunTarget {
  readonly owner: string;
  readonly repo: string;
  readonly headSha: string;
  /** Never read from argv: the caller takes it from the environment. */
  readonly token: string;
  /**
   * This App's own id. Only the App that made a run may modify it, so with an
   * id the publisher finds its own in-flight run instead of posting a second.
   */
  readonly appId?: number;
  /** Defaults to `https://api.github.com`. Set this for Enterprise Server. */
  readonly baseUrl?: string;
  /** Injected in tests. Defaults to the global `fetch`. */
  readonly fetch?: typeof globalThis.fetch;
  /** The checkout, so an absolute `source` can be made relative. */
  readonly root?: string;
}

/** One annotation, in the shape the Checks API takes. */
export interface Annotation {
  readonly path: string;
  readonly start_line: number;
  readonly end_line: number;
  readonly annotation_level: string;
  readonly title: string;
  readonly message: string;
}

/** One annotation per finding that names a file; the rest live in the summary. */
export function annotationsFor(findings: readonly Finding[], root?: string): Annotation[] {
  return findings.flatMap((found) => {
    const place = placeOf(found, root);
    if (place === undefined) return [];
    return [
      {
        path: place.path,
        start_line: place.line,
        end_line: place.line,
        annotation_level: LEVEL[found.severity],
        title: found.rule,
        message: found.message,
      },
    ];
  });
}

async function send(
  target: CheckRunTarget,
  path: string,
  method: string,
  body: unknown,
): Promise<{ id: number }> {
  const call = target.fetch ?? globalThis.fetch;
  const response = await call(`${target.baseUrl ?? "https://api.github.com"}${path}`, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${target.token}`,
      "content-type": "application/json",
      "user-agent": "maple-kit",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`GitHub ${String(response.status)} on ${method} ${path}: ${detail}`);
  }
  return (await response.json()) as { id: number };
}

/**
 * The run this App left in flight on the commit, if any. As in the visual-review
 * gate, other Apps' runs are ignored and a completed run is never reopened.
 */
async function inFlight(target: CheckRunTarget, repo: string): Promise<{ id: number } | undefined> {
  if (target.appId === undefined) return undefined;
  const call = target.fetch ?? globalThis.fetch;
  const path =
    `${repo}/commits/${target.headSha}/check-runs` +
    `?check_name=${encodeURIComponent(DESIGN_LINT_CHECK)}&filter=all`;
  const response = await call(`${target.baseUrl ?? "https://api.github.com"}${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${target.token}`,
      "user-agent": "maple-kit",
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error(`GitHub ${String(response.status)} on GET ${path}`);
  const { check_runs } = (await response.json()) as {
    check_runs: { id: number; status: string; app?: { id: number } | null }[];
  };
  const mine = check_runs.filter((run) => String(run.app?.id) === String(target.appId)).at(-1);
  return mine && mine.status !== "completed" ? mine : undefined;
}

/**
 * Creates the completed check run on `target.headSha` and returns its id. Throws
 * with GitHub's answer when it refuses, which a caller reports and does not retry.
 */
export async function publishCheckRun(
  target: CheckRunTarget,
  verdict: Verdict,
  findings: readonly Finding[],
): Promise<number> {
  const repo = `/repos/${target.owner}/${target.repo}`;
  const all = annotationsFor(findings, target.root);
  const output = { title: verdict.title, summary: verdict.summary };

  const body = {
    status: "completed",
    conclusion: verdict.conclusion,
    completed_at: new Date().toISOString(),
    output: { ...output, annotations: all.slice(0, ANNOTATIONS_PER_REQUEST) },
  };
  const open = await inFlight(target, repo);
  const created = open
    ? await send(target, `${repo}/check-runs/${String(open.id)}`, "PATCH", body)
    : await send(target, `${repo}/check-runs`, "POST", {
        ...body,
        name: DESIGN_LINT_CHECK,
        head_sha: target.headSha,
      });

  for (let from = ANNOTATIONS_PER_REQUEST; from < all.length; from += ANNOTATIONS_PER_REQUEST) {
    const annotations = all.slice(from, from + ANNOTATIONS_PER_REQUEST);
    await send(target, `${repo}/check-runs/${String(created.id)}`, "PATCH", {
      output: { ...output, annotations },
    });
  }
  return created.id;
}
