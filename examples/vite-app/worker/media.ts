/**
 * Where a preview keeps its screenshots: one R2 bucket shared by every pull
 * request's Worker, each under its own `pr-<number>/` prefix.
 *
 * The route serves a screenshot to anyone holding its link, because GitHub's
 * image proxy has to fetch it with no cookie. The key is 128 random bits, so
 * the link is the credential. Uploading needs a signed-in reviewer.
 */

import { readGitHubSession } from "@maple-kit/core/auth";
import { r2Media } from "@maple-kit/core/connectors";

import type { MediaConnector, R2BucketLike } from "@maple-kit/core/connectors";

/** The binding and variable the screenshots need. */
export interface MediaEnv {
  readonly SCREENSHOTS: R2BucketLike;
  /** The pull request number, which names this preview's prefix. */
  readonly MAPLE_PR: string;
}

/** The connector the route uses: it serves the bytes itself. */
export function routeMedia(env: MediaEnv): MediaConnector {
  return r2Media({ bucket: env.SCREENSHOTS, prefix: `pr-${env.MAPLE_PR}/` });
}

/** The connector the pull-request table uses: its links are the route's own. */
export function tableMedia(env: MediaEnv, origin: string): MediaConnector {
  return r2Media({
    bucket: env.SCREENSHOTS,
    prefix: `pr-${env.MAPLE_PR}/`,
    url: (key) => `${origin}/api/maple/media/${key}`,
  });
}

/** A refusal for an upload with no reviewer behind it, or undefined to go on. */
export async function refuseAnonymousUpload(
  request: Request,
  secret: string,
): Promise<Response | undefined> {
  const { pathname } = new URL(request.url);
  if (request.method !== "POST" || pathname !== "/api/maple/media") return undefined;

  const session = await readGitHubSession(
    { headers: Object.fromEntries(request.headers), url: request.url },
    { secret },
  );
  if (session !== null) return undefined;
  return Response.json({ error: "Sign in to attach a screenshot" }, { status: 401 });
}
