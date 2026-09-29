import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { normalizeUrl, resolveLocalPlace, slugify } from "../src/local/local-place.js";
import { addWorktree, git, initRepo, scratch } from "./local-repo.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const remove of cleanups.splice(0)) remove();
});

function sandbox(): string {
  const made = scratch();
  cleanups.push(made.remove);
  return made.dir;
}

describe("slugify", () => {
  it.each([
    ["feat/local-store", "feat-local-store"],
    ["Feature/ABC_123", "feature-abc_123"],
    ["release/1.2.0", "release-1.2.0"],
    ["../../etc/passwd", "etc-passwd"],
    ["...", "default"],
    ["", "default"],
  ])("%s becomes %s", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});

describe("normalizeUrl", () => {
  it.each([
    ["localhost:3000", "localhost-3000"],
    ["http://localhost:3000", "localhost-3000"],
    ["https://Preview.Example.com/some/path?x=1#top", "preview.example.com"],
    ["http://127.0.0.1:5173/", "127.0.0.1-5173"],
  ])("%s becomes %s", (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });
});

describe("resolveLocalPlace", () => {
  it("keys a repository by its branch and roots it at the checkout", async () => {
    const repo = initRepo(sandbox());
    git(repo, "checkout", "-q", "-b", "feat/one");

    const place = await resolveLocalPlace({ cwd: repo });

    expect(place).toEqual({
      root: repo,
      key: "feat-one",
      dir: join(repo, ".maple", "feat-one"),
      source: "branch",
      branch: "feat/one",
    });
  });

  it("roots every worktree at the main checkout, each under its own branch", async () => {
    const repo = initRepo(sandbox());
    const one = addWorktree(repo, "feat/one", "wt-one");
    const two = addWorktree(repo, "feat/two", "wt-two");

    const places = await Promise.all([one, two, repo].map((cwd) => resolveLocalPlace({ cwd })));

    expect(places.map((place) => place.root)).toEqual([repo, repo, repo]);
    expect(places.map((place) => place.key)).toEqual(["feat-one", "feat-two", "main"]);
  });

  it("finds the root from a subdirectory", async () => {
    const repo = initRepo(sandbox());
    mkdirSync(join(repo, "src"));
    const place = await resolveLocalPlace({ cwd: join(repo, "src") });

    expect(place.root).toBe(repo);
  });

  it.each<[string, string | undefined, string]>([
    ["a URL with a port", "http://localhost:3000", "localhost-3000"],
    ["no URL at all", undefined, "default"],
  ])("falls back to %s when HEAD is detached", async (_case, url, key) => {
    const repo = initRepo(sandbox());
    git(repo, "checkout", "-q", "--detach");

    const place = await resolveLocalPlace({ cwd: repo, ...(url === undefined ? {} : { url }) });

    expect(place).toMatchObject({ key, source: "url", root: repo });
  });

  it("falls back to the URL outside a repository, rooted at the directory", async () => {
    const dir = sandbox();

    const place = await resolveLocalPlace({ cwd: dir, url: "localhost:3000" });

    expect(place).toEqual({
      root: dir,
      key: "localhost-3000",
      dir: join(dir, ".maple", "localhost-3000"),
      source: "url",
    });
  });

  it("takes an injected root over the checkout's", async () => {
    const repo = initRepo(sandbox());
    const elsewhere = sandbox();

    const place = await resolveLocalPlace({ cwd: repo, root: elsewhere });

    expect(place.dir).toBe(join(elsewhere, ".maple", "main"));
  });
});
