import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { gitChangedFiles } from "../src/changed-files.js";

function sh(cwd: string, ...args: string[]): void {
  const identity = ["-c", "user.name=t", "-c", "user.email=t@example.test"];
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- git is whichever one the hook or CI runs.
  execFileSync("git", [...identity, ...args], { cwd, stdio: "ignore" });
}

describe("gitChangedFiles", () => {
  it("lists what the branch changed since the base, and not what it deleted", async () => {
    const dir = await mkdtemp(join(tmpdir(), "maple-changed-"));
    await mkdir(join(dir, "src"));
    await writeFile(join(dir, "src/old.tsx"), "old");
    await writeFile(join(dir, "src/same.tsx"), "same");
    sh(dir, "init", "-q", "-b", "main");
    sh(dir, "add", ".");
    sh(dir, "commit", "-q", "-m", "base", "--no-gpg-sign");
    sh(dir, "checkout", "-q", "-b", "topic");
    await writeFile(join(dir, "src/new.tsx"), "new");
    await rm(join(dir, "src/old.tsx"));
    sh(dir, "add", "-A");
    sh(dir, "commit", "-q", "-m", "change", "--no-gpg-sign");

    expect(await gitChangedFiles("main", dir)).toEqual(["src/new.tsx"]);
  });

  it("rejects a base that does not exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "maple-changed-"));
    sh(dir, "init", "-q", "-b", "main");
    await expect(gitChangedFiles("origin/main", dir)).rejects.toThrow();
  });
});
