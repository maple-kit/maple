import { readGitHubSession } from "./cookie.js";

import type { IdentityConnector } from "../connectors/types.js";
import type { SessionCookieOptions } from "./cookie.js";

/**
 * Names the reviewer from their GitHub session, so a comment and the overlay
 * carry the login they signed in with rather than "Guest". It reads the cookie
 * and makes no call. A session without a login stays a guest: the token still
 * writes, but there is nobody to name.
 */
export function githubIdentity(options: SessionCookieOptions = {}): IdentityConnector {
  return {
    name: "github-session",
    async resolveUser(request) {
      const session = await readGitHubSession(request, options);
      if (session?.login === undefined) return null;
      return {
        id: session.login,
        name: session.login,
        avatarUrl: `https://github.com/${encodeURIComponent(session.login)}.png`,
      };
    },
  };
}
