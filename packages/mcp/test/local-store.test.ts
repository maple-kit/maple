import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fileStore } from "@maple-kit/core/local";
import { sampleComment } from "@maple-kit/core/testing";
import { afterEach, describe, expect, it } from "vitest";

import { storeFromEnvironment } from "../src/config.js";
import { createToolHandlers } from "../src/handlers.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

/** A directory that is not a repository, so the folder is named by the URL. */
function project(): string {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "maple-mcp-")));
  directories.push(directory);
  return directory;
}

describe("which store the environment names", () => {
  it.each<[string, Record<string, string>, string]>([
    ["nothing at all", {}, "file"],
    [
      "a token alone",
      { GITHUB_TOKEN: "t", MAPLE_GITHUB_OWNER: "o", MAPLE_GITHUB_REPO: "r" },
      "github",
    ],
    ["`file` beside a forge", { MAPLE_STORE: "file", GITHUB_TOKEN: "t" }, "file"],
    [
      "`github` explicitly",
      { MAPLE_STORE: "github", MAPLE_GITHUB_OWNER: "o", MAPLE_GITHUB_REPO: "r", GITHUB_TOKEN: "t" },
      "github",
    ],
  ])("%s gives the %s store", (_case, env, name) => {
    expect(storeFromEnvironment(env, project()).name).toBe(name);
  });

  it.each<[string, Record<string, string>, RegExp]>([
    [
      "a half-written forge configuration",
      { MAPLE_GITHUB_REPO: "r" },
      /MAPLE_GITHUB_OWNER is not set/,
    ],
    [
      "an unknown store",
      { MAPLE_STORE: "sqlite" },
      /Unknown MAPLE_STORE sqlite; "github" and "file" exist/,
    ],
  ])("still refuses %s rather than falling back", (_case, env, message) => {
    expect(() => storeFromEnvironment(env, project())).toThrow(message);
  });
});

describe("the agent loop with no forge", () => {
  it("lists what the route wrote to .maple/ and resolves it there", async () => {
    const cwd = project();
    const written = await fileStore({ cwd }).append(
      sampleComment({ branch: "feat/x", body: "Tighten the header." }),
    );
    const handlers = createToolHandlers({ store: storeFromEnvironment({}, cwd) });

    const open = await handlers.listComments({ branch: "feat/x", statuses: ["open"] });
    expect(open.map((comment) => comment.id)).toEqual([written.id]);

    await handlers.resolveComment({ id: written.id, sha: "abc1234", note: "Done." });

    expect(await handlers.listComments({ branch: "feat/x", statuses: ["open"] })).toEqual([]);
    const [resolved] = await handlers.listComments({ branch: "feat/x", statuses: ["resolved"] });
    expect(resolved).toMatchObject({
      id: written.id,
      resolution: { sha: "abc1234", note: "Done." },
    });
  });

  it("reads a comment written after the server started, since every call reads the file", async () => {
    const cwd = project();
    const handlers = createToolHandlers({ store: storeFromEnvironment({}, cwd) });
    expect(await handlers.listComments({ branch: "b" })).toEqual([]);

    await fileStore({ cwd }).append(sampleComment({ branch: "b" }));

    expect(await handlers.listComments({ branch: "b" })).toHaveLength(1);
  });
});
