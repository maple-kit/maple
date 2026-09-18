/**
 * Reading the store out of the environment.
 *
 * An MCP server is started by a client with no arguments, so the environment
 * is the only channel there is. A missing value fails loudly at startup rather
 * than on the first tool call, where a client would show it as a tool error.
 */

import { githubStore } from "@maple-kit/core/connectors";

import type { StoreConnector } from "@maple-kit/core";

/** Builds the store named by `MAPLE_STORE`, or the default. */
export function storeFromEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): StoreConnector {
  const kind = env["MAPLE_STORE"] ?? "github";
  if (kind !== "github") throw new Error(`Unknown MAPLE_STORE ${kind}; only "github" exists yet.`);

  return githubStore({
    owner: required(env, "MAPLE_GITHUB_OWNER"),
    repo: required(env, "MAPLE_GITHUB_REPO"),
    token: required(env, "GITHUB_TOKEN"),
    ...(env["MAPLE_GITHUB_API"] === undefined ? {} : { baseUrl: env["MAPLE_GITHUB_API"] }),
  });
}

/** The branch the agent is reviewing. */
export function branchFromEnvironment(env: Readonly<Record<string, string | undefined>>): string {
  return required(env, "MAPLE_BRANCH");
}

function required(env: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set; Maple's MCP server cannot start without it.`);
  return value;
}
