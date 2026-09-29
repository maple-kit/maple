import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { reviewStore } from "../src/review/store.js";

const cwd = mkdtempSync(join(tmpdir(), "maple-review-store-"));
afterAll(() => rmSync(cwd, { recursive: true, force: true }));

const URL = "http://localhost:5173";

describe("reviewStore", () => {
  it.each([
    ["nothing configured", {}],
    ["a GitHub token alone, which is on most laptops", { GITHUB_TOKEN: "placeholder" }],
    ["the file store asked for by name", { MAPLE_STORE: "file", MAPLE_GITHUB_OWNER: "acme" }],
  ] as const)("uses the local file store for %s", async (_name, env) => {
    const chosen = await reviewStore(env, cwd, URL);

    expect(chosen.kind).toBe("file");
    expect(chosen.media).toBeDefined();
    expect(chosen.where).toBe(join(cwd, ".maple", "localhost-5173"));
    expect(chosen.branch).toBe("localhost-5173");
  });

  it("uses GitHub when the repository is named", async () => {
    const chosen = await reviewStore(
      { MAPLE_GITHUB_OWNER: "acme", MAPLE_GITHUB_REPO: "web", GITHUB_TOKEN: "placeholder" },
      cwd,
      URL,
    );

    expect(chosen).toMatchObject({ kind: "github", where: "acme/web on GitHub" });
    expect(chosen.media).toBeUndefined();
  });

  it.each([
    [
      "a github store missing its token",
      { MAPLE_GITHUB_OWNER: "a", MAPLE_GITHUB_REPO: "b" },
      "GITHUB_TOKEN is not set",
    ],
    ["a store that does not exist", { MAPLE_STORE: "sqlite" }, "Unknown MAPLE_STORE sqlite"],
  ] as const)("refuses %s, saying what is missing", async (_name, env, said) => {
    await expect(reviewStore(env, cwd, URL)).rejects.toThrow(said);
  });
});
