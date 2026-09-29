import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { fileStore } from "../src/local/file-store.js";
import { writeAtomic } from "../src/local/local-files.js";
import { sampleComment } from "../src/testing/fixtures.js";
import { scratch } from "./local-repo.js";

vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, rename: vi.fn(actual.rename), writeFile: vi.fn(actual.writeFile) };
});

const fs = await import("node:fs/promises");

const cleanups: (() => void)[] = [];
afterEach(() => {
  vi.mocked(fs.rename).mockRestore();
  vi.mocked(fs.writeFile).mockRestore();
  for (const remove of cleanups.splice(0)) remove();
});

function sandbox(): string {
  const made = scratch();
  cleanups.push(made.remove);
  return made.dir;
}

describe("an atomic write", () => {
  it("leaves the target whole and no temporary file behind", async () => {
    const dir = sandbox();
    const target = join(dir, "nested", "file.json");

    await writeAtomic(target, "one");
    await writeAtomic(target, "two");

    expect(readFileSync(target, "utf8")).toBe("two");
    expect(readdirSync(join(dir, "nested"))).toEqual(["file.json"]);
  });

  it.each<[string, "rename" | "writeFile"]>([
    ["the rename", "rename"],
    ["the write", "writeFile"],
  ])("keeps the old contents when %s fails, and cleans up", async (_case, failing) => {
    const dir = sandbox();
    const target = join(dir, "file.json");
    await writeAtomic(target, "old");
    vi.mocked(fs[failing]).mockRejectedValueOnce(new Error("disk went away"));

    await expect(writeAtomic(target, "new")).rejects.toThrow("disk went away");

    expect(readFileSync(target, "utf8")).toBe("old");
    expect(readdirSync(dir)).toEqual(["file.json"]);
  });

  it("never exposes a half-written comments.json through the store", async () => {
    const cwd = sandbox();
    const store = fileStore({ cwd, url: "localhost:3000" });
    await store.append(sampleComment({ branch: "b", body: "first" }));
    vi.mocked(fs.rename).mockRejectedValueOnce(new Error("crash"));

    await expect(store.append(sampleComment({ branch: "b", body: "second" }))).rejects.toThrow(
      "crash",
    );

    const page = await store.list({ branch: "b" });
    expect(page.comments.map((comment) => comment.body)).toEqual(["first"]);
  });
});
