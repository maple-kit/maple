import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  compareVersions,
  duplicateParagraphs,
  IGNORE,
  isChecked,
  overlap,
  paragraphs,
  releasedVersions,
  staleVersions,
  versionMentions,
} from "./check.js";

const CURRENT = new Map([
  ["@maple-kit/cli", "0.12.0"],
  ["@maple-kit/mcp", "0.12.0"],
]);

describe("compareVersions", () => {
  it.each<[string, string, number]>([
    ["0.11.0", "0.12.0", -1],
    ["0.12.0", "0.12.0", 0],
    ["0.12.1", "0.12.0", 1],
    ["0.9.0", "0.10.0", -1],
  ])("%s vs %s", (a, b, sign) => {
    expect(Math.sign(compareVersions(a, b))).toBe(sign);
  });
});

describe("versionMentions", () => {
  it.each<[string, string, { name: string; version: string }[]]>([
    ["attached", "`npx @maple-kit/mcp@0.11.0`", [{ name: "@maple-kit/mcp", version: "0.11.0" }]],
    [
      "after the name",
      "@maple-kit/cli since 0.9.1.",
      [{ name: "@maple-kit/cli", version: "0.9.1" }],
    ],
    ["before the name", "0.8.0 of @maple-kit/cli", [{ name: "@maple-kit/cli", version: "0.8.0" }]],
    [
      "the nearer of two names",
      "@maple-kit/cli and @maple-kit/mcp@0.3.0",
      [{ name: "@maple-kit/mcp", version: "0.3.0" }],
    ],
    ["no package on the line", "released in 0.9.0", []],
    ["too far from the name", `@maple-kit/cli ${"x".repeat(80)} 0.1.0`, []],
    ["a four-part number", "@maple-kit/cli 0.1.0.4", []],
    ["a fenced block", "```\n@maple-kit/cli@0.1.0\n```", []],
    ["an ignored line", `@maple-kit/cli@0.1.0 ${IGNORE}`, []],
  ])("%s", (_case, text, expected) => {
    expect(versionMentions(text).map(({ name, version }) => ({ name, version }))).toEqual(expected);
  });
});

describe("staleVersions", () => {
  it.each<[string, string, RegExp[]]>([
    ["current", "@maple-kit/mcp@0.12.0", []],
    ["newer than released", "@maple-kit/mcp@0.13.0", []],
    [
      "older",
      "x\n@maple-kit/mcp@0.11.0",
      [/^a\.md:2: 0\.11\.0 is older than @maple-kit\/mcp's current 0\.12\.0\.$/],
    ],
    ["an unknown package", "@maple-kit/gone@0.1.0", []],
  ])("%s", (_case, text, problems) => {
    const found = staleVersions("a.md", text, CURRENT);
    expect(found).toHaveLength(problems.length);
    problems.forEach((pattern, index) => {
      expect(found[index]).toMatch(pattern);
    });
  });
});

const words = (count: number, seed = "word") =>
  Array.from({ length: count }, (_, index) => `${seed}${index}`).join(" ");

describe("paragraphs", () => {
  it("splits on blank lines, headings, tables and comments, and normalises", () => {
    const text = "# Head\nOne *Two*\nthree.\n\n| a |\nFour\n<!-- x -->\n```\nfive\n```\nSix";
    expect(paragraphs(text)).toEqual([
      { line: 2, words: ["one", "two", "three"] },
      { line: 6, words: ["four"] },
      { line: 11, words: ["six"] },
    ]);
  });

  it("leaves out a paragraph under the ignore marker", () => {
    expect(paragraphs(`${IGNORE}\nkept out\n\nkept`)).toEqual([{ line: 4, words: ["kept"] }]);
  });
});

describe("overlap", () => {
  it.each<[string, string[], string[], number]>([
    ["identical", ["a", "b", "c", "d"], ["a", "b", "c", "d"], 1],
    ["disjoint", ["a", "b", "c"], ["x", "y", "z"], 0],
    ["one contained in the other", ["a", "b", "c"], ["q", "a", "b", "c", "r"], 1],
    ["too short for a trigram", ["a", "b"], ["a", "b"], 0],
  ])("%s", (_case, a, b, expected) => {
    expect(overlap(a, b)).toBe(expected);
  });
});

describe("duplicateParagraphs", () => {
  const long = words(45);
  it.each<[string, string, RegExp[]]>([
    ["distinct paragraphs", `${long}\n\n${words(45, "other")}`, []],
    [
      "an exact repeat",
      `${long}\n\nbetween\n\n${long}`,
      [/^a\.md:5: repeats the paragraph at line 1\.$/],
    ],
    [
      "a repeat differing in case and markup",
      `${long}\n\n**${long.toUpperCase()}**`,
      [/^a\.md:3: repeats/],
    ],
    [
      "a repeat with one word changed",
      `${long}\n\n${long.replace("word20", "changed")}`,
      [/repeats/],
    ],
    ["a short paragraph twice", "short one here\n\nshort one here", []],
    ["a repeat under the ignore marker", `${long}\n\n${IGNORE}\n${long}`, []],
  ])("%s", (_case, text, problems) => {
    const found = duplicateParagraphs("a.md", text);
    expect(found).toHaveLength(problems.length);
    problems.forEach((pattern, index) => {
      expect(found[index]).toMatch(pattern);
    });
  });
});

describe("isChecked", () => {
  it.each([
    ["docs/gate.md", true],
    ["packages/cli/CHANGELOG.md", false],
    [".agents/skills/typesafe-ai/SKILL.md", false],
  ])("%s → %s", (file, expected) => {
    expect(isChecked(file)).toBe(expected);
  });
});

describe("releasedVersions", () => {
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
  });

  it("takes each package's newest tag, by version rather than by name", async () => {
    const root = await mkdtemp(join(tmpdir(), "maple-doc-guards-"));
    roots.push(root);
    const git = (...args: string[]) =>
      // eslint-disable-next-line sonarjs/no-os-command-from-path -- the test drives the same git.
      execFileSync("git", args, { cwd: root, stdio: "ignore" });
    git("init", "-q");
    git(
      "-c",
      "user.email=t@example.com",
      "-c",
      "user.name=t",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "x",
    );
    for (const tag of [
      "@maple-kit/a@0.9.0",
      "@maple-kit/a@0.10.0",
      "@maple-kit/b@0.1.0",
      "other@1.0.0",
    ]) {
      git("tag", tag);
    }
    expect(Object.fromEntries(releasedVersions(root))).toEqual({
      "@maple-kit/a": "0.10.0",
      "@maple-kit/b": "0.1.0",
    });
  });
});
