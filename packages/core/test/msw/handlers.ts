/**
 * Shared handlers, one export per upstream.
 *
 * A suite pulls in a whole upstream at once from here. Upstreams that need
 * state across requests — anything the contract suite reads back after a
 * write — export a factory instead, so each suite gets its own.
 */

import type { RequestHandler } from "msw";

export { createGitHubFake, pullFor } from "./github.js";
export type { GitHubFake } from "./github.js";

/** Handlers loaded by default. Suites add their own on top. */
export const handlers: RequestHandler[] = [];
