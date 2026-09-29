/**
 * Where a local connector keeps its files, and under which key.
 *
 * The key is the branch checked out in the working directory, because
 * `localhost:3000` is shared by every branch that runs on it and a URL key
 * would show one branch's comments on another. With no branch to read, the
 * normalized URL stands in. The root is the main checkout, so every worktree
 * of a repository writes to one `.maple/` and removing one keeps its comments.
 * `docs/connectors.md` has the rest of the argument.
 */

import { execFile } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Used when there is neither a branch nor a URL to name the folder after. */
const FALLBACK_KEY = "default";

/** Where the folders live, relative to the root. */
export const LOCAL_FOLDER = ".maple";

/** What a local connector may be told, all of it for a test or an odd layout. */
export interface LocalPlaceOptions {
  /** The directory whose git state names the key. Defaults to the process's. */
  readonly cwd?: string;
  /** Where `.maple/` goes, instead of the main checkout's top level. */
  readonly root?: string;
  /**
   * The address the app is served on, such as `http://localhost:3000`. Names
   * the folder when there is no branch to; without it that folder is `default`.
   */
  readonly url?: string;
}

/** A resolved folder. */
export interface LocalPlace {
  /** The directory that holds `.maple/`. */
  readonly root: string;
  /** The folder's name under `.maple/`. */
  readonly key: string;
  /** Absolute path of `.maple/<key>`. */
  readonly dir: string;
  /** Whether the key came from a branch or fell back to the URL. */
  readonly source: "branch" | "url";
  /**
   * The branch as git names it, where `source` is `branch`. The key is a
   * lossy slug of it, and a comment carries the name itself.
   */
  readonly branch?: string;
}

/**
 * A branch or a URL as a folder name. Lossy on purpose: `feat/x` and `feat-x`
 * share a folder, and that is safe because every comment still carries its own
 * branch and a listing filters on it.
 */
export function slugify(input: string): string {
  const slug = trimSeparators(input.toLowerCase().replaceAll(/[^a-z0-9._]+/g, "-"));
  return slug === "" ? FALLBACK_KEY : slug;
}

/** Without leading or trailing dashes and dots, so a slug is never `..` or hidden. */
function trimSeparators(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && "-.".includes(text[start]!)) start += 1;
  while (end > start && "-.".includes(text[end - 1]!)) end -= 1;
  return text.slice(start, end);
}

/** `http://localhost:3000/` as `localhost-3000`. */
export function normalizeUrl(url: string): string {
  const scheme = url.indexOf("://");
  const authority = (scheme === -1 ? url : url.slice(scheme + 3)).split(/[/?#]/)[0] ?? "";
  return slugify(authority);
}

/** Git's stdout, or undefined where git fails, is missing or the answer is empty. */
async function git(cwd: string, args: readonly string[]): Promise<string | undefined> {
  // An enclosing hook exports these, and they would override the directory.
  const env = {
    ...process.env,
    GIT_DIR: undefined,
    GIT_WORK_TREE: undefined,
    GIT_INDEX_FILE: undefined,
  };
  try {
    const { stdout } = await run("git", [...args], { cwd, env });
    return stdout.trim() === "" ? undefined : stdout.trim();
  } catch {
    return undefined;
  }
}

/** The main checkout's top level, found through the git directory every worktree shares. */
async function mainCheckout(cwd: string): Promise<string | undefined> {
  const common = await git(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (common === undefined) return undefined;
  return basename(common) === ".git" ? dirname(common) : common;
}

function urlKey(url: string | undefined): string {
  return url === undefined ? FALLBACK_KEY : normalizeUrl(url);
}

/** Resolves the folder a local connector reads and writes right now. */
export async function resolveLocalPlace(options: LocalPlaceOptions = {}): Promise<LocalPlace> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const branch = await git(cwd, ["symbolic-ref", "--short", "-q", "HEAD"]);
  const root =
    options.root === undefined ? ((await mainCheckout(cwd)) ?? cwd) : resolve(options.root);

  const key = branch === undefined ? urlKey(options.url) : slugify(branch);
  return {
    root,
    key,
    dir: join(root, LOCAL_FOLDER, key),
    source: branch === undefined ? "url" : "branch",
    ...(branch === undefined ? {} : { branch }),
  };
}
