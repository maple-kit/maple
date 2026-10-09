/**
 * The example as a Cloudflare Worker: `dist-preview/` as static assets, the
 * SDK route on `/api/maple/*`, and the page's own API from one table.
 *
 * The store is the pull request this build came from, written as the reviewer
 * with the token their cookie carries, so the example reviews the change that
 * deployed it. Nothing here is a secret: the client id is public.
 */

import { createCommentStore } from "@maple-kit/core";
import { githubIdentity, readGitHubSession } from "@maple-kit/core/auth";
import { createPullCache, githubStore, keywordClassifier } from "@maple-kit/core/connectors";
import { createLogger } from "@maple-kit/core/logger";
import { createMapleHandler } from "@maple-kit/core/route";

import openapi from "../openapi.json";
import { answerExample } from "../src/app/example-api.js";
import { gateFrom } from "./gate.js";

import type { GateEnv } from "./gate.js";
import type { GateResolver, StoreResolver } from "@maple-kit/core/route";

/** The variables `wrangler deploy --var` sets, the gate App's secret, and the assets binding. */
interface Env extends GateEnv {
  readonly ASSETS: { fetch(request: Request): Promise<Response> };
  readonly MAPLE_GITHUB_CLIENT_ID: string;
  /** The commit the preview was built from, which names its pull request. */
  readonly MAPLE_COMMIT: string;
}

/** Shared by every per-reviewer store in an isolate, so the lookup runs once. */
const pulls = createPullCache();

function storeFor(env: Env): StoreResolver {
  const [owner = "", repo = ""] = env.MAPLE_REPO.split("/");
  return async (request) => {
    const session = await readGitHubSession(request);
    if (session === null) return null;
    const connector = githubStore({
      owner,
      repo,
      token: session.token,
      pull: { commit: env.MAPLE_COMMIT },
      cache: pulls,
    });
    return createCommentStore(connector);
  };
}

/** The route keeps a store's error out of the browser; Workers Logs keeps it. */
const logger = createLogger();

function gateOption(env: Env): { gate?: GateResolver } {
  const gate = gateFrom(env, logger);
  return gate === undefined ? {} : { gate };
}

type Handler = (request: Request) => Promise<Response>;

/** Built on the first request: the variables arrive with it, not at import. */
let handler: Handler | undefined;

function handlerFor(env: Env): Handler {
  handler ??= createMapleHandler({
    logger,
    store: storeFor(env),
    // Names the reviewer by their GitHub login; without it comments say "Guest".
    identity: githubIdentity(),
    githubAuth: { clientId: env.MAPLE_GITHUB_CLIENT_ID },
    // Only with the gate App's three bindings; without them the action's run stands.
    ...gateOption(env),
    mock: {
      preview: true,
      schemas: [{ codec: "rest", document: openapi }],
      plan: { classifier: keywordClassifier() },
    },
  });
  return handler;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/maple/")) return handlerFor(env)(request);

    const answer = answerExample(request.method, pathname);
    if (answer === undefined) return env.ASSETS.fetch(request);
    if ("empty" in answer) return new Response(null, { status: 204 });
    return Response.json(answer.body);
  },
};
