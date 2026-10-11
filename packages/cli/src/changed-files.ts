/**
 * The files a change touches, which the judged tier serves first: a pull
 * request's from the GitHub API in CI, a branch's from git on a laptop.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

/** What `maple lint --changed` compares against when no base is named. */
export const DEFAULT_BASE = "origin/main";

const PER_PAGE = 100;
/** GitHub lists at most 3000 files of a pull request. */
const MAX_PAGES = 30;

/** Which pull request, on which API. */
export interface PullRequestRef {
  readonly token: string;
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
  readonly fetch?: typeof fetch;
  /** Defaults to `https://api.github.com`. */
  readonly baseUrl?: string;
}

interface PullFile {
  readonly filename?: unknown;
  readonly status?: unknown;
}

/** The paths a pull request adds or changes, from `GET /pulls/{n}/files`. Throws when GitHub refuses. */
export async function pullRequestFiles(ref: PullRequestRef): Promise<readonly string[]> {
  const call = ref.fetch ?? fetch;
  const root = (ref.baseUrl ?? "https://api.github.com").replace(/\/$/, "");
  const files: string[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `${root}/repos/${ref.owner}/${ref.repo}/pulls/${String(ref.number)}/files?per_page=${String(PER_PAGE)}&page=${String(page)}`;
    const response = await call(url, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${ref.token}`,
        "x-github-api-version": "2022-11-28",
      },
    });
    if (!response.ok) throw new Error(`GitHub answered ${String(response.status)}`);
    const body = (await response.json()) as PullFile[];
    for (const file of body) {
      if (typeof file.filename === "string" && file.status !== "removed") files.push(file.filename);
    }
    if (body.length < PER_PAGE) break;
  }
  return files;
}

/** The paths changed on this branch since it left `base`, from `git diff --name-only <base>...HEAD`. */
export async function gitChangedFiles(base: string, cwd: string): Promise<readonly string[]> {
  const { stdout } = await exec(
    "git",
    ["diff", "--name-only", "--diff-filter=d", `${base}...HEAD`],
    { cwd },
  );
  return stdout.split("\n").filter((line) => line !== "");
}
