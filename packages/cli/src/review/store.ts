/**
 * Which store `maple review` writes comments to.
 *
 * There is no `maple use` yet, so the configuration is the environment, read
 * the way the MCP server reads it: a forge in the environment means the
 * `github` store, and nothing configured means the local files under
 * `.maple/<branch>/`, so a first run needs no account. The SQLite store is for
 * a shared server and is never chosen here.
 */

import { createCommentStore } from "@maple-kit/core";
import { githubStore } from "@maple-kit/core/connectors";
import { fileMedia, fileStore, resolveLocalPlace } from "@maple-kit/core/local";

import type { CommentStore } from "@maple-kit/core";
import type { MediaConnector } from "@maple-kit/core/connectors";

/** Maple's own forge variables. GITHUB_TOKEN alone is on most laptops and means nothing here. */
const FORGE_VARIABLES = ["MAPLE_GITHUB_OWNER", "MAPLE_GITHUB_REPO"] as const;

/** The store a review writes to, and what to call the branch it is about. */
export interface ReviewStore {
  readonly kind: "file" | "github";
  readonly store: CommentStore;
  /** Absent for a store with nowhere to keep a screenshot. */
  readonly media?: MediaConnector;
  /** What the overlay names as the branch under review. */
  readonly branch: string;
  /** Where the comments are, for the CLI to say. */
  readonly where: string;
}

type Environment = Readonly<Record<string, string | undefined>>;

function required(env: Environment, name: string): string {
  const value = env[name];
  if (value) return value;
  throw new Error(`${name} is not set, and MAPLE_STORE=github needs it.`);
}

/** The store `env` names, or the local files in `cwd` where it names none. */
export async function reviewStore(
  env: Environment,
  cwd: string,
  url: string,
): Promise<ReviewStore> {
  const kind =
    env["MAPLE_STORE"] ?? (FORGE_VARIABLES.some((name) => env[name]) ? "github" : "file");
  if (kind !== "file" && kind !== "github") {
    throw new Error(`Unknown MAPLE_STORE ${kind}; "github" and "file" exist.`);
  }

  const place = await resolveLocalPlace({ cwd, url });
  const branch = place.branch ?? place.key;
  if (kind === "file") {
    return {
      kind,
      store: createCommentStore(fileStore({ cwd, url })),
      media: fileMedia({ cwd, url }),
      branch,
      where: place.dir,
    };
  }

  const api = env["MAPLE_GITHUB_API"];
  const owner = required(env, "MAPLE_GITHUB_OWNER");
  const repo = required(env, "MAPLE_GITHUB_REPO");
  return {
    kind,
    store: createCommentStore(
      githubStore({
        owner,
        repo,
        token: required(env, "GITHUB_TOKEN"),
        ...(api === undefined ? {} : { baseUrl: api }),
      }),
    ),
    branch,
    where: `${owner}/${repo} on GitHub`,
  };
}
