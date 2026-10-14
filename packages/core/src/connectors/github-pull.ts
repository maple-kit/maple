/**
 * Finding the pull request a preview belongs to.
 *
 * The branch name is the easy case and not the common one. A preview hostname
 * has to be a DNS label, so what it usually carries is a ticket, a shortened
 * branch or nothing at all — and the build knows its commit for certain while
 * the browser knows only the name it was served under. Every integration that
 * hit this wrote the same two GitHub calls and the same cache; this is that,
 * once.
 */

import { AmbiguousPullError, UpstreamError } from "../errors.js";

/** How a surface identifier becomes a pull request, when it is not a branch. */
export interface PullLookup {
  /**
   * The pull request the deploy states. Asked before anything else, and used
   * only while it is open: a number the deploy was given is not inferred.
   */
  readonly pullRequest?: number;
  /**
   * The exact head branch the deploy states. Asked after the stated pull
   * request and before the commit, and used only while a pull request on it is open.
   */
  readonly branch?: string;
  /**
   * The commit the preview was built from. Asked first and trusted outright:
   * `GET /commits/{sha}/pulls` names the pull request rather than inferring it.
   */
  readonly commit?: string;
  /**
   * Which open head belongs to an identifier, when nothing exact found one.
   * Several matches throw `AmbiguousPullError`; nothing is guessed.
   */
  readonly matches?: (head: string, identifier: string) => boolean;
  /** Open pull requests only. Without it the key's head may fall back to a closed one. */
  readonly openOnly?: boolean;
}

/**
 * Where a resolved pull request is remembered.
 *
 * It is a parameter rather than a closure because a store built per request —
 * which is what a per-reviewer credential needs — has a new closure every
 * time, so the cache has to outlive it. Create one per process.
 */
export interface PullCache {
  /**
   * Resolved or resolving, per token, for {@link POSITIVE_TTL_MS}. A rejection
   * removes itself, so a failure is re-asked.
   */
  readonly held: Map<string, Held>;
  /** What a reviewer was told, for {@link NEGATIVE_TTL_MS}: no pull request, or a refusal. */
  readonly missed: Map<string, Unresolved>;
}

/** A resolution in flight or done, and when it stops being believed. */
export interface Held {
  readonly pending: Promise<PullMatch | undefined>;
  readonly until: number;
}

/** An answer that is not a pull request, and when it stops being believed. */
export interface Unresolved {
  readonly until: number;
  /** Absent for "no open pull request"; otherwise the refusal to repeat. */
  readonly refusal?: Error;
}

/**
 * How long "none", an ambiguous match or a 401, 403 or 404 is believed. A pull
 * request is opened after its preview builds, so this stays short; it exists so
 * one page load does not ask GitHub the same question once per route call.
 */
export const NEGATIVE_TTL_MS = 15_000;

/**
 * How long a resolved pull request is believed. Long enough that a page load
 * asks once, short enough that a merged pull request followed by a new one on
 * the same branch is picked up.
 */
export const POSITIVE_TTL_MS = 5 * 60_000;

/** Creates a cache. One per process, shared by every per-request store. */
export function createPullCache(): PullCache {
  return { held: new Map(), missed: new Map() };
}

/** What the lookup needs from the GitHub client, and nothing more. */
export interface PullReader {
  readonly owner: string;
  readonly repo: string;
  /**
   * Who is asking, normally their token. Every cached answer is the asker's
   * own: a 403, or a repository one reviewer can see, says nothing about the next.
   */
  readonly scope?: string;
  get<T>(path: string): Promise<T>;
}

interface PullRequest {
  readonly number: number;
  readonly state?: string;
  readonly head: { readonly ref: string };
}

/** A resolved pull request and the head branch it is reviewed on. */
export interface PullMatch {
  readonly number: number;
  readonly head: string;
}

const PAGE_SIZE = 100;

/**
 * The pull request for a surface, or undefined when nothing open matches.
 *
 * Kept on the commit where there is one and on the identifier otherwise: a
 * deployment serves one surface for its whole life. A hit is kept; a miss only
 * for {@link NEGATIVE_TTL_MS}, because the pull request is opened after the
 * branch is pushed and the preview builds.
 */
export async function findPull(
  api: PullReader,
  identifier: string,
  lookup: PullLookup | undefined,
  cache: PullCache | undefined,
): Promise<number | undefined> {
  return (await resolvePull(api, identifier, lookup, cache))?.number;
}

/**
 * Like {@link findPull}, and also says which head branch the pull request is
 * on. Throws `AmbiguousPullError` when several open ones match.
 */
export function resolvePull(
  api: PullReader,
  identifier: string,
  lookup: PullLookup | undefined,
  cache: PullCache | undefined,
): Promise<PullMatch | undefined> {
  const stated =
    lookup?.pullRequest === undefined ? undefined : `pull:${String(lookup.pullRequest)}`;
  const key = `${api.owner}/${api.repo}#${stated ?? lookup?.branch ?? lookup?.commit ?? identifier}`;
  const asked = `${api.scope ?? ""}\n${key}`;
  const known = cache === undefined ? undefined : heldFor(cache, asked);
  if (known) return known;

  const repeat = cache === undefined ? undefined : believed(cache, asked);
  if (repeat) return repeat.refusal ? Promise.reject(repeat.refusal) : Promise.resolve(undefined);

  const forget = (): void => {
    cache?.held.delete(asked);
  };
  const pending = resolve(api, identifier, lookup).then(
    (found) => {
      if (found === undefined) {
        forget();
        if (cache) remember(cache, asked, {});
      }
      return found;
    },
    (error: unknown) => {
      forget();
      if (cache && error instanceof Error && isRefusal(error))
        remember(cache, asked, { refusal: error });
      throw error;
    },
  );

  cache?.held.set(asked, { pending, until: Date.now() + POSITIVE_TTL_MS });
  return pending;
}

function heldFor(cache: PullCache, asked: string): Promise<PullMatch | undefined> | undefined {
  const entry = cache.held.get(asked);
  if (entry === undefined) return undefined;
  if (entry.until > Date.now()) return entry.pending;
  cache.held.delete(asked);
  return undefined;
}

/** An answer that is a verdict on this asker rather than a failure to be retried. */
function isRefusal(error: Error): boolean {
  if (error instanceof AmbiguousPullError) return true;
  if (!(error instanceof UpstreamError)) return false;
  return error.status === 401 || error.status === 403 || error.status === 404;
}

function believed(cache: PullCache, asked: string): Unresolved | undefined {
  const entry = cache.missed.get(asked);
  if (entry === undefined) return undefined;
  if (entry.until > Date.now()) return entry;
  cache.missed.delete(asked);
  return undefined;
}

function remember(cache: PullCache, asked: string, answer: { refusal?: Error }): void {
  const now = Date.now();
  for (const [key, entry] of cache.missed) if (entry.until <= now) cache.missed.delete(key);
  cache.missed.set(asked, { until: now + NEGATIVE_TTL_MS, ...answer });
}

/**
 * The stated number, branch, commit, the key's own name, then the application's
 * rule. A commit in a stack lets the later rungs choose; ambiguous if none do.
 */
async function resolve(
  api: PullReader,
  identifier: string,
  lookup: PullLookup | undefined,
): Promise<PullMatch | undefined> {
  const stated =
    lookup?.pullRequest === undefined ? undefined : await ofNumber(api, lookup.pullRequest);
  if (stated !== undefined) return stated;

  const branch = lookup?.branch === undefined ? undefined : await ofOpenHead(api, lookup.branch);
  if (branch !== undefined) return branch;

  const commit =
    lookup?.commit === undefined
      ? undefined
      : await ofCommit(api, lookup.commit, [lookup.branch, identifier]);
  if (commit?.found !== undefined) return commit.found;

  const named = await ofHead(api, identifier, lookup?.openOnly === true);
  if (named !== undefined) return named;

  const matched =
    lookup?.matches === undefined ? undefined : await ofMatch(api, identifier, lookup.matches);
  if (matched !== undefined) return matched;

  if (commit !== undefined && commit.stack.length > 1) {
    throw new AmbiguousPullError(commit.stack.map((pull) => pull.number));
  }
  return undefined;
}

/** A number the deploy stated, if it is still open. Gone or closed falls through. */
async function ofNumber(api: PullReader, number: number): Promise<PullMatch | undefined> {
  try {
    const path = `/repos/${api.owner}/${api.repo}/pulls/${String(number)}`;
    const pull = await api.get<PullRequest>(path);
    return pull.state === "open" ? { number: pull.number, head: pull.head.ref } : undefined;
  } catch (error) {
    if (error instanceof UpstreamError && error.status === 404) return undefined;
    throw error;
  }
}

/** The open pull request on exactly this head branch, if there is one. */
async function ofOpenHead(api: PullReader, branch: string): Promise<PullMatch | undefined> {
  const head = encodeURIComponent(`${api.owner}:${branch}`);
  const path = `/repos/${api.owner}/${api.repo}/pulls?head=${head}&per_page=1&state=open`;
  const open = (await api.get<PullRequest[]>(path))[0];
  return open === undefined ? undefined : { number: open.number, head: branch };
}

/** What a commit's pull requests say: the one chosen, and every open one it sits in. */
interface CommitPulls {
  readonly found?: PullMatch;
  readonly stack: readonly PullMatch[];
}

/**
 * Open pull requests only; 404 or 422 is an unknown sha. Several open ones are a
 * stack: the one on the stated branch or the key wins, else none is chosen here.
 */
async function ofCommit(
  api: PullReader,
  commit: string,
  preferred: readonly (string | undefined)[],
): Promise<CommitPulls | undefined> {
  const path = `/repos/${api.owner}/${api.repo}/commits/${encodeURIComponent(commit)}/pulls`;
  let pulls: PullRequest[];
  try {
    pulls = await api.get<PullRequest[]>(path);
  } catch (error) {
    const unknown =
      error instanceof UpstreamError && (error.status === 404 || error.status === 422);
    if (unknown) return undefined;
    throw error;
  }

  const stack = pulls
    .filter((pull) => pull.state === "open")
    .map((pull) => ({ number: pull.number, head: pull.head.ref }));
  const only = stack.length === 1 ? stack[0] : stack.find((pull) => preferred.includes(pull.head));
  return only === undefined ? { stack } : { found: only, stack };
}

/**
 * The identifier as the head branch's own name. Open beats a newer closed
 * duplicate; closed only without `openOnly`, which a store on a merged branch needs.
 */
async function ofHead(
  api: PullReader,
  branch: string,
  openOnly: boolean,
): Promise<PullMatch | undefined> {
  const head = encodeURIComponent(`${api.owner}:${branch}`);
  const base = `/repos/${api.owner}/${api.repo}/pulls?head=${head}&per_page=1`;

  const open = (await api.get<PullRequest[]>(`${base}&state=open`))[0]?.number;
  if (open !== undefined) return { number: open, head: branch };
  if (openOnly) return undefined;

  const path = `${base}&state=all&sort=updated&direction=desc`;
  const any = (await api.get<PullRequest[]>(path))[0]?.number;
  return any === undefined ? undefined : { number: any, head: branch };
}

/** Exactly one match or none: several is ambiguous, and nothing is guessed. */
async function ofMatch(
  api: PullReader,
  identifier: string,
  matches: (head: string, identifier: string) => boolean,
): Promise<PullMatch | undefined> {
  const path =
    `/repos/${api.owner}/${api.repo}/pulls` +
    `?state=open&sort=updated&direction=desc&per_page=${String(PAGE_SIZE)}`;
  const open = await api.get<PullRequest[]>(path);

  const found = open.filter((pull) => matches(pull.head.ref, identifier));
  if (found.length > 1) throw new AmbiguousPullError(found.map((pull) => pull.number));
  const only = found[0];
  return only === undefined ? undefined : { number: only.number, head: only.head.ref };
}
