import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { capabilitiesOf, missingRequirements } from "../src/connectors/capabilities.js";
import { fileMedia } from "../src/connectors/file-media.js";
import { fileStore } from "../src/connectors/file-store.js";
import { sampleComment } from "../src/testing/fixtures.js";
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

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const URL_KEY = { url: "http://localhost:3000" };

describe("the file connectors as connectors", () => {
  it("are usable ones, by the same check every connector passes", () => {
    expect(missingRequirements("store", fileStore())).toEqual([]);
    expect(missingRequirements("media", fileMedia())).toEqual([]);
  });

  it("report exactly the methods they define", () => {
    expect(capabilitiesOf("store", fileStore())).toMatchObject({
      list: true,
      append: true,
      appendMany: true,
      setStatus: true,
      approvals: true,
      head: false,
      watch: false,
    });
    expect(capabilitiesOf("media", fileMedia())).toEqual({
      putBlob: true,
      getUrl: true,
      remove: true,
    });
  });
});

describe("two worktrees on different branches, one URL", () => {
  it("each see only their own comments, in one shared .maple/", async () => {
    const repo = initRepo(sandbox());
    const one = addWorktree(repo, "feat/one", "wt-one");
    const two = addWorktree(repo, "feat/two", "wt-two");
    const stores = [one, two].map((cwd) => fileStore({ cwd, ...URL_KEY }));

    // Same port, so the same page URL and, in the overlay, the same `branch`.
    await stores[0]!.append(sampleComment({ branch: "shared", body: "from one" }));
    await stores[1]!.append(sampleComment({ branch: "shared", body: "from two" }));

    const seen = await Promise.all(stores.map((store) => store.list({ branch: "shared" })));
    expect(seen.map((page) => page.comments.map((comment) => comment.body))).toEqual([
      ["from one"],
      ["from two"],
    ]);
    expect(readdirSync(join(repo, ".maple")).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "feat-one",
      "feat-two",
    ]);
  });

  it("keep a worktree's comments after the worktree is removed", async () => {
    const repo = initRepo(sandbox());
    const one = addWorktree(repo, "feat/one", "wt-one");
    await fileStore({ cwd: one }).append(sampleComment({ branch: "feat/one" }));

    git(repo, "worktree", "remove", "--force", one);
    git(repo, "checkout", "-q", "feat/one");

    const page = await fileStore({ cwd: repo }).list({ branch: "feat/one" });
    expect(page.comments).toHaveLength(1);
  });

  it("follow a branch switch without a restart", async () => {
    const repo = initRepo(sandbox());
    const store = fileStore({ cwd: repo });
    await store.append(sampleComment({ branch: "b", body: "on main" }));

    git(repo, "checkout", "-q", "-b", "other");

    expect((await store.list({ branch: "b" })).comments).toEqual([]);
  });
});

describe("with no branch to read", () => {
  it.each<[string, (repo: string) => string]>([
    ["a detached HEAD", (repo) => (git(repo, "checkout", "-q", "--detach"), repo)],
    ["a directory that is not a repository", () => sandbox()],
  ])("%s keys the folder by the URL", async (_case, prepare) => {
    const repo = initRepo(sandbox());
    const cwd = prepare(repo);

    await fileStore({ cwd, ...URL_KEY }).append(sampleComment());

    expect(readdirSync(join(cwd, ".maple"))).toEqual(["localhost-3000"]);
  });
});

describe("persistence", () => {
  it("survives a new connector, which is what a dev-server restart is", async () => {
    const cwd = sandbox();
    const before = fileStore({ cwd, ...URL_KEY });
    const stored = await before.append(sampleComment({ branch: "b" }));
    await before.setStatus?.(stored.id, "resolved", { sha: "abc123", at: "2026-01-01T00:00:00Z" });

    const page = await fileStore({ cwd, ...URL_KEY }).list({ branch: "b" });

    expect(page.comments).toMatchObject([{ id: stored.id, status: "resolved" }]);
  });

  it("writes plain JSON a person can read", async () => {
    const cwd = sandbox();
    await fileStore({ cwd, ...URL_KEY }).append(sampleComment({ body: "readable" }));

    const text = readFileSync(join(cwd, ".maple", "localhost-3000", "comments.json"), "utf8");

    expect(JSON.parse(text)).toMatchObject({ version: 1, comments: [{ body: "readable" }] });
  });

  it("loses no write when several arrive at once", async () => {
    const store = fileStore({ cwd: sandbox(), ...URL_KEY });

    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        store.append(sampleComment({ branch: "b", body: `c${index}` })),
      ),
    );

    expect((await store.list({ branch: "b" })).comments).toHaveLength(20);
  });

  it("refuses to overwrite a file it cannot read", async () => {
    const cwd = sandbox();
    const dir = join(cwd, ".maple", "localhost-3000");
    await mkdir(dir, { recursive: true });
    writeFileSync(join(dir, "comments.json"), "{ not json");

    await expect(fileStore({ cwd, ...URL_KEY }).append(sampleComment())).rejects.toThrow(
      /not a Maple comments file/,
    );
    expect(readFileSync(join(dir, "comments.json"), "utf8")).toBe("{ not json");
  });
});

describe("file media", () => {
  it("keeps a blob under media/<key>.<ext> beside the comments", async () => {
    const cwd = sandbox();
    const media = fileMedia({ cwd, ...URL_KEY });

    const ref = await media.putBlob({ data: PNG, contentType: "image/png" });

    const dir = join(cwd, ".maple", "localhost-3000", "media");
    expect(readdirSync(dir)).toEqual([`${ref.key}.png`]);
    expect(new Uint8Array(readFileSync(join(dir, `${ref.key}.png`)))).toEqual(PNG);
  });

  it.each(["../comments", "a/b", "shot.png", ""])("refuses the key %j as a path", async (key) => {
    const media = fileMedia({ cwd: sandbox(), ...URL_KEY });

    await expect(
      media.getUrl({ connector: "file", key, contentType: "image/png" }),
    ).rejects.toThrow(RangeError);
  });

  it("serves the type its extension says, not the one the caller asks for", async () => {
    const media = fileMedia({ cwd: sandbox(), ...URL_KEY });
    const ref = await media.putBlob({ data: PNG, contentType: "image/png" });

    const url = await media.getUrl({ ...ref, contentType: "application/octet-stream" });

    expect(url).toMatch(/^data:image\/png;base64,/);
  });
});
