/**
 * The preview half of the route: who this deployment is serving, and which
 * pull request that is.
 *
 * Identity comes from the `PreviewEnvironment`, the pull request from the
 * reviewer's own GitHub token. Neither is written into a page at build time.
 */

import { openSession } from "../auth/cookie.js";
import { createPullCache, resolvePull } from "../connectors/github-pull.js";
import { githubStore, pullReader } from "../connectors/github.js";
import { AmbiguousPullError, UpstreamError } from "../errors.js";
import { createCommentStore } from "../store.js";

import type { PullCache, PullLookup } from "../connectors/github-pull.js";
import type { IdentityRequest, MediaConnector, PreviewInfo } from "../connectors/types.js";
import type { Logger } from "../logger/types.js";
import type { PreviewEnvironment, PreviewIdentity } from "../preview/types.js";
import type { CommentStore } from "../store.js";
import type { GitHubAuthOptions } from "./auth.js";

/** Where the preview's pull requests live. */
export interface PreviewGitHub {
  readonly owner: string;
  readonly repo: string;
  /** Shared across requests. Defaults to one per handler. */
  readonly cache?: PullCache;
  /** Turns a screenshot into the link a pull request comment carries, as `githubStore`'s `media`. */
  readonly media?: MediaConnector;
}

/** Everything the preview arm of the route is built from. */
export interface PreviewRoute {
  readonly preview: PreviewEnvironment;
  readonly github: PreviewGitHub | undefined;
  readonly auth: GitHubAuthOptions | undefined;
  readonly pulls: PullCache;
  readonly logger: Logger | undefined;
  /** The one-per-process warning about where identity comes from, once given. */
  readonly warned: { done: boolean };
}

/** Why a preview's pull request is not known, when it is not. */
export type ContextReason =
  "sign-in" | "none" | "ambiguous" | "no-access" | "unavailable" | "unconfigured";

/** What the route found out about one request. */
export interface PreviewReading {
  readonly identity: PreviewIdentity;
  readonly info: PreviewInfo;
  readonly resolved: boolean;
  readonly reason: ContextReason | null;
}

/** The body of `GET /context`. */
export interface ContextBody {
  readonly preview: string;
  readonly key: string;
  readonly branch: string;
  readonly label: string;
  readonly commit: string | null;
  readonly pullRequest: number | null;
  /** The pull request's web address; null without a number or a `github` option. */
  readonly pullRequestUrl: string | null;
  readonly resolved: boolean;
  readonly reason: ContextReason | null;
}

/** Builds the arm from the handler's options. Undefined when there is no `preview`. */
export function createPreviewRoute(
  preview: PreviewEnvironment | undefined,
  github: PreviewGitHub | undefined,
  auth: GitHubAuthOptions | undefined,
  logger?: Logger,
): PreviewRoute | undefined {
  if (preview === undefined) return undefined;
  const pulls = github?.cache ?? createPullCache();
  return { preview, github, auth, pulls, logger, warned: { done: false } };
}

/** What the deploy states, and the hook that finds a head the exact lookups missed. */
export function pullLookup(preview: PreviewEnvironment, identity: PreviewIdentity): PullLookup {
  return {
    openOnly: true,
    ...(identity.branch === undefined ? {} : { branch: identity.branch }),
    ...(identity.commit === undefined ? {} : { commit: identity.commit }),
    ...(identity.pullRequest === undefined ? {} : { pullRequest: identity.pullRequest }),
    ...(preview.matches === undefined
      ? {}
      : { matches: (head: string) => preview.matches?.(head, identity) === true }),
  };
}

/** The info known without asking GitHub: the stated head branch, else the key, until a pull request says. */
function knownInfo(identity: PreviewIdentity): PreviewInfo {
  return {
    key: identity.key,
    label: identity.key,
    branch: identity.branch ?? identity.key,
    ...(identity.commit === undefined ? {} : { commit: identity.commit }),
    ...(identity.pullRequest === undefined ? {} : { pullRequest: identity.pullRequest }),
  };
}

/** A stated number GitHub found closed or ambiguous is not the answer, and is not passed on. */
function withoutPull(info: PreviewInfo): PreviewInfo {
  return {
    key: info.key,
    label: info.label,
    branch: info.branch,
    ...(info.commit === undefined ? {} : { commit: info.commit }),
  };
}

/**
 * Null when the request is not served by a preview. With `resolve`, also asks
 * GitHub for the pull request as the reviewer: the number and head branch the
 * overlay and a per-request callback need. A refusal is a `reason`, not a throw.
 */
export async function readPreview(
  route: PreviewRoute,
  request: IdentityRequest,
  resolve: boolean,
): Promise<PreviewReading | null> {
  const identity = await route.preview.identify(request);
  warnOnce(route, identity);
  if (identity === null) return null;

  const info = knownInfo(identity);
  const unresolved = (reason: ContextReason): PreviewReading => ({
    identity,
    info: reason === "none" || reason === "ambiguous" ? withoutPull(info) : info,
    resolved: false,
    reason,
  });
  if (!resolve) return unresolved("sign-in");
  if (route.github === undefined) return unresolved("unconfigured");

  const session = route.auth ? await openSession(request.headers, route.auth) : null;
  if (session === null) return unresolved("sign-in");

  const { owner, repo } = route.github;
  const reader = pullReader({ owner, repo, token: session.token });
  try {
    const found = await resolvePull(
      reader,
      identity.key,
      pullLookup(route.preview, identity),
      route.pulls,
    );
    if (found === undefined) return unresolved("none");
    const resolved = { ...info, branch: found.head, pullRequest: found.number };
    return { identity, info: resolved, resolved: true, reason: null };
  } catch (error) {
    const reason = refusal(error);
    if (reason === undefined) throw error;
    return unresolved(reason);
  }
}

/**
 * One warning per process when the key is not from the deploy's env: nothing
 * else is exact, and a deploy without it answers 404 until a request names a key.
 */
function warnOnce(route: PreviewRoute, identity: PreviewIdentity | null): void {
  const { logger, warned, preview } = route;
  if (logger === undefined || warned.done) return;

  const setup = "`maple setup preview mirrord` writes it.";
  if (preview.envKey?.set === false) {
    warned.done = true;
    logger.warn(
      `${preview.envKey.name} is not set, so this preview is identified only by what a request carries. The env override is the dependable source; ${setup}`,
    );
  } else if (identity !== null && identity.source !== "env") {
    warned.done = true;
    logger.warn(
      `This preview was identified from a request's ${identity.source}. The env override is the dependable source; ${setup}`,
    );
  }
}

/**
 * GitHub's answers a reviewer can act on, or undefined for a real failure. Any
 * other 4xx is a request GitHub refused for this reviewer: `no-access`, not a 500.
 */
function refusal(error: unknown): ContextReason | undefined {
  if (error instanceof AmbiguousPullError) return "ambiguous";
  if (!(error instanceof UpstreamError)) return undefined;
  if (error.status === 401) return "sign-in";
  if (error.status >= 500 || error.status === 429) return "unavailable";
  return error.status >= 400 && error.status < 500 ? "no-access" : undefined;
}

/** The status and body `GET /context` answers with. */
export function contextAnswer(
  route: PreviewRoute,
  reading: PreviewReading,
): { readonly status: number; readonly body: ContextBody | { error: string; reason: string } } {
  if (reading.reason === "unavailable") {
    return { status: 502, body: { error: "GitHub could not be reached", reason: "unavailable" } };
  }
  const { info } = reading;
  const github = route.github;
  // `readPreview` already left out a stated number that GitHub found closed or ambiguous.
  const pullRequest = info.pullRequest;
  const pullRequestUrl =
    github === undefined || pullRequest === undefined
      ? null
      : `https://github.com/${github.owner}/${github.repo}/pull/${pullRequest}`;
  return {
    status: 200,
    body: {
      preview: route.preview.name,
      key: info.key,
      branch: info.branch,
      label: info.label,
      commit: info.commit ?? null,
      pullRequest: pullRequest ?? null,
      pullRequestUrl,
      resolved: reading.resolved,
      reason: reading.reason,
    },
  };
}

/**
 * The store a preview writes to when the host gave none: the pull request's
 * comments, under the reviewer's own token. Null until they have linked.
 */
export function previewStore(
  route: PreviewRoute,
): (request: IdentityRequest) => Promise<CommentStore | null> {
  return async (request) => {
    const { github, auth } = route;
    if (github === undefined || auth === undefined) return null;

    const [identity, session] = await Promise.all([
      route.preview.identify(request),
      openSession(request.headers, auth),
    ]);
    if (identity === null || session === null) return null;

    return createCommentStore(
      githubStore({
        owner: github.owner,
        repo: github.repo,
        token: session.token,
        pull: pullLookup(route.preview, identity),
        cache: route.pulls,
        ...(github.media === undefined ? {} : { media: github.media }),
      }),
    );
  };
}
