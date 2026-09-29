import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Runs git in `cwd` with no inherited repository and no signing. */
export function git(cwd: string, ...args: string[]): string {
  const inherited = new Set(["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !inherited.has(name)),
  );

  return execFileSync(
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- git is whichever one the hook or CI runs.
    "git",
    [
      "-c",
      "user.name=Maple Test",
      "-c",
      "user.email=test@example.invalid",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd, env, encoding: "utf8" },
  ).trim();
}

/** A scratch directory that is removed by the returned function. */
export function scratch(): { readonly dir: string; readonly remove: () => void } {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "maple-local-")));
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true }) };
}

/** A repository on `main` with one commit, so a worktree can be added to it. */
export function initRepo(parent: string, name = "main-checkout"): string {
  const path = join(parent, name);
  mkdirSync(path);
  git(path, "init", "-q", "-b", "main");
  git(path, "commit", "-q", "--allow-empty", "-m", "first");
  return path;
}

/** Adds a worktree of `repo` on a new branch and returns its path. */
export function addWorktree(repo: string, branch: string, name: string): string {
  const path = join(repo, "..", name);
  git(repo, "worktree", "add", "-q", "-b", branch, path);
  return realpathSync(path);
}
