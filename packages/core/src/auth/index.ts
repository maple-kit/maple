/**
 * How Maple authenticates to GitHub, both ways round.
 *
 * A reviewer signs in with Device Flow and comments as themselves; the gate
 * App signs itself in and writes a check run as Maple. They are two Apps on
 * purpose, and `docs/github-auth.md` is the reasoning.
 *
 * Everything here runs on the SDK route. A device code, a token and a private
 * key are all credentials, and none belongs in a bundle the browser downloads.
 */

export { PENDING_COOKIE, readGitHubSession, SESSION_COOKIE } from "./cookie.js";

export type { GitHubSession, SessionCookieOptions } from "./cookie.js";

export { createDeviceFlow, DeviceFlowError } from "./device-flow.js";

export type {
  DeviceCode,
  DeviceExchange,
  DeviceFlow,
  DeviceFlowFailure,
  DeviceFlowOptions,
  DeviceToken,
} from "./device-flow.js";

export { githubIdentity } from "./identity.js";

export { createInstallationAuth, InstallationAuthError } from "./installation.js";

export type { InstallationAuth, InstallationAuthOptions } from "./installation.js";
