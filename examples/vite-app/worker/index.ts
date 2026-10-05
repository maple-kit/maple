/**
 * The deployed preview: Workers static assets serve `dist-preview/`, and this
 * Worker answers what a static build cannot. The Maple route at `/api/maple`,
 * and the page's own API, which the Vite servers answer in development.
 *
 * Comments are written to the pull request that deployed it, as the reviewer,
 * through `githubStore`. Nothing here is a secret: the App's client id is public
 * and a reviewer's token lives in their own cookie.
 */

import { createCommentStore } from "@maple-kit/core";
import { readGitHubSession } from "@maple-kit/core/auth";
import { createPullCache, githubStore } from "@maple-kit/core/connectors";
import { consoleSink, createLogger } from "@maple-kit/core/logger";
import { createMapleHandler, DEFAULT_BASE_PATH } from "@maple-kit/core/route";

import openapi from "../openapi.json" with { type: "json" };
import { answerFor } from "../server/answers.js";
import { exampleMock } from "../server/mock.js";

/** The binding to the static assets, as `wrangler.jsonc` names it. */
interface Assets {
  fetch(request: Request): Promise<Response>;
}

/** Set by `wrangler deploy --var`, from CI. All are public values. */
interface Env {
  readonly ASSETS: Assets;
  /** `1` in a preview. Any other value serves no route at all. */
  readonly MAPLE_PREVIEW?: string;
  /** `owner/repo`, whose pull requests hold the comments. */
  readonly MAPLE_REPOSITORY?: string;
  /** The head commit this was built from; how a branch becomes a pull request. */
  readonly MAPLE_COMMIT?: string;
  /** The comment App's client id. Without it nobody can sign in to comment. */
  readonly MAPLE_GITHUB_CLIENT_ID?: string;
  /** Optional, set with `wrangler secret put`. Encrypts the reviewer's cookie. */
  readonly MAPLE_COOKIE_KEY?: string;
}

const NOT_FOUND = (): Response => new Response("Not found", { status: 404 });

/** A resolved pull request is remembered across the stores built per request. */
const pulls = createPullCache();
const logger = createLogger({ sinks: [consoleSink()] });

type Handler = (request: Request) => Promise<Response>;

function routeFor(env: Env): Handler {
  const [owner, repo] = (env.MAPLE_REPOSITORY ?? "").split("/");
  const key = env.MAPLE_COOKIE_KEY;
  const clientId = env.MAPLE_GITHUB_CLIENT_ID;

  return createMapleHandler({
    logger,
    mock: exampleMock(openapi, true),
    store: async (request) => {
      if (!owner || !repo) return null;
      const session = await readGitHubSession(request, key ? { key } : {});
      if (!session) return null;
      return createCommentStore(
        githubStore({
          owner,
          repo,
          token: session.token,
          cache: pulls,
          ...(env.MAPLE_COMMIT ? { pull: { commit: env.MAPLE_COMMIT } } : {}),
        }),
      );
    },
    ...(clientId ? { githubAuth: { clientId, ...(key ? { key } : {}) } } : {}),
  });
}

/** Built on the first request, because `env` only exists inside `fetch`. */
let route: Handler | undefined;

function answerPage(request: Request): Response | undefined {
  const answer = answerFor(request.method, new URL(request.url).pathname);
  if (answer === undefined) return undefined;
  if (answer.body === null) return new Response(null, { status: answer.status });
  return Response.json(answer.body);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === DEFAULT_BASE_PATH || pathname.startsWith(`${DEFAULT_BASE_PATH}/`)) {
      if (env.MAPLE_PREVIEW !== "1") return NOT_FOUND();
      route ??= routeFor(env);
      return route(request);
    }
    return answerPage(request) ?? env.ASSETS.fetch(request);
  },
};
