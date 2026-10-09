/**
 * The GitHub gate: `maple/visual-review`, a check run held open while comments
 * are open.
 *
 * Only a GitHub App can create a check run, and this one authenticates as
 * itself. It never sees a reviewer's token; `docs/github-auth.md` says why
 * that has to be a second App.
 */

import { USER_AGENT } from "../internal/user-agent.js";

import type { GateConclusion, GateReason, GateVerdict } from "../types.js";
import type { GateConnector, GateReport, GateTarget } from "./types.js";

/** Everything the gate needs to reach a repository. */
export interface GitHubGateOptions {
  readonly owner: string;
  readonly repo: string;
  /**
   * An installation token for the gate's own App. Never a reviewer's token:
   * read it from the environment at the call site.
   */
  readonly token: string;
  /** Defaults to `https://api.github.com`. Set this for Enterprise Server. */
  readonly baseUrl?: string;
  /** Injected in tests. Defaults to the global `fetch`. */
  readonly fetch?: typeof globalThis.fetch;
  /**
   * The check's name, which is what a ruleset requires. Changing it makes the
   * old name a required check nothing ever reports on again.
   */
  readonly name?: string;
  /**
   * This App's own id. Only the App that made a run may modify it, and
   * `docs/gate.md` has the 403 that finding out cost.
   */
  readonly appId?: string | number;
}

/** The name a branch-protection ruleset requires. */
export const CHECK_NAME = "maple/visual-review";

const DEFAULT_BASE = "https://api.github.com";

/** Creates a gate connector backed by a check run. */
export function githubGate(options: GitHubGateOptions): GateConnector {
  const api = createClient(options);

  return {
    name: "github",
    publish: (report) => publish(api, report),
    read: (target) => read(api, target),
  };
}

/** The narrow GitHub client the rest of this file is written against. */
interface Client {
  readonly options: GitHubGateOptions;
  readonly check: string;
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

/** One check run, trimmed to what this connector reads. */
interface CheckRun {
  readonly id: number;
  readonly status: string;
  readonly conclusion: string | null;
  readonly external_id: string | null;
  readonly output: { readonly title: string | null; readonly summary: string | null } | null;
  /** Who created it. Absent on a forge that does not report it. */
  readonly app?: { readonly id: number } | null;
}

function createClient(options: GitHubGateOptions): Client {
  const base = options.baseUrl ?? DEFAULT_BASE;
  const call = options.fetch ?? globalThis.fetch;

  return {
    options,
    check: options.name ?? CHECK_NAME,
    async request<T>(path: string, init: RequestInit = {}): Promise<T> {
      const response = await call(`${base}${path}`, {
        ...init,
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${options.token}`,
          "x-github-api-version": "2022-11-28",
          "user-agent": USER_AGENT,
          ...(init.body === undefined ? {} : { "content-type": "application/json" }),
          ...init.headers,
        },
      });

      if (!response.ok) throw await failure(response, path);
      return (await response.json()) as T;
    },
  };
}

/** GitHub's message, not ours; a caller deciding what to retry needs it. */
async function failure(response: Response, path: string): Promise<Error> {
  const detail = await response.text().catch(() => "");
  const parsed: unknown = detail ? safeJson(detail) : undefined;
  const message =
    typeof parsed === "object" && parsed !== null && "message" in parsed
      ? String(parsed.message)
      : detail || response.statusText;

  return new Error(`GitHub ${String(response.status)} on ${path}: ${message}`);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Updates the run in flight, or posts a new one. A completed run is never
 * reopened: a new run under the same name and SHA supersedes it.
 */
async function publish(api: Client, report: GateReport): Promise<void> {
  const existing = await latest(api, report);
  const body = JSON.stringify(payload(api, report));

  if (existing && existing.status !== "completed") {
    await api.request(`${repoPath(api)}/check-runs/${String(existing.id)}`, {
      method: "PATCH",
      body,
    });
    return;
  }

  await api.request(`${repoPath(api)}/check-runs`, { method: "POST", body });
}

/** What the verdict looks like as a check run. */
function payload(api: Client, report: GateReport): Record<string, unknown> {
  const now = new Date().toISOString();
  const blocked = report.verdict.conclusion === "blocked";

  return {
    name: api.check,
    head_sha: report.sha,
    external_id: externalId(report.verdict),
    started_at: now,
    ...(blocked
      ? { status: "in_progress" }
      : {
          status: "completed",
          conclusion: concluded(report.verdict.conclusion),
          completed_at: now,
        }),
    ...(report.reviewUrl === undefined ? {} : { details_url: report.reviewUrl }),
    output: { title: report.verdict.title, summary: report.verdict.summary },
  };
}

/**
 * A required check passes only on success, skipped or neutral, so a blocked
 * commit never reaches here: docs/gate.md says why it stays `in_progress`.
 */
function concluded(conclusion: GateConclusion): string {
  return conclusion === "clear" ? "success" : "neutral";
}

async function read(api: Client, target: GateTarget): Promise<GateVerdict | undefined> {
  const run = await latest(api, target);
  if (!run) return undefined;

  const counts = countsIn(run.external_id);
  return {
    conclusion: conclusionOf(run),
    reason: counts.reason,
    title: run.output?.title ?? "",
    summary: run.output?.summary ?? "",
    open: counts.open,
    total: counts.total,
  };
}

/**
 * The most recent run this connector may act on. Told which App it is, it
 * ignores everyone else's runs and supersedes them with one of its own.
 */
async function latest(api: Client, target: GateTarget): Promise<CheckRun | undefined> {
  const { appId } = api.options;
  const filter = appId === undefined ? "latest" : "all";
  const path =
    `${repoPath(api)}/commits/${target.sha}/check-runs` +
    `?check_name=${encodeURIComponent(api.check)}&filter=${filter}`;

  const { check_runs } = await api.request<{ check_runs: CheckRun[] }>(path);
  if (appId === undefined) return check_runs[0];

  return check_runs.filter((run) => String(run.app?.id) === String(appId)).at(-1);
}

function conclusionOf(run: CheckRun): GateConclusion {
  if (run.status !== "completed") return "blocked";
  return run.conclusion === "success" ? "clear" : "neutral";
}

/**
 * The counts ride in `external_id`, the field the API reserves for exactly
 * this. Reading them back out of the markdown summary would be parsing prose.
 */
function externalId(verdict: GateVerdict): string {
  return JSON.stringify({ r: verdict.reason, o: verdict.open, t: verdict.total });
}

interface Counts {
  readonly reason: GateReason;
  readonly open: number;
  readonly total: number;
}

/** A run somebody else's tooling created carries no counts; say zero, not a guess. */
function countsIn(externalId: string | null): Counts {
  const parsed = externalId === null ? undefined : safeJson(externalId);
  if (typeof parsed !== "object" || parsed === null) {
    return { reason: "unreadable", open: 0, total: 0 };
  }

  const held = parsed as Record<string, unknown>;
  return {
    reason: typeof held["r"] === "string" ? (held["r"] as GateReason) : "unreadable",
    open: typeof held["o"] === "number" ? held["o"] : 0,
    total: typeof held["t"] === "number" ? held["t"] : 0,
  };
}

function repoPath(api: Client): string {
  return `/repos/${api.options.owner}/${api.options.repo}`;
}
