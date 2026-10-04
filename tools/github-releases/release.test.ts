import { describe, expect, it } from "vitest";

import { changelogSection, createArgs, parseTag } from "./release.js";

const CHANGELOG = `# @maple-kit/core

## 0.3.0

### Minor Changes

- aaa: Third.

## 0.2.0

No changes in this release.

## 0.1.0

### Patch Changes

- bbb: First.
`;

describe("changelogSection", () => {
  it.each([
    ["first section", "0.3.0", "### Minor Changes\n\n- aaa: Third."],
    ["middle section", "0.2.0", "No changes in this release."],
    ["last section", "0.1.0", "### Patch Changes\n\n- bbb: First."],
    ["missing version", "0.9.9", undefined],
    ["a prefix of another version", "0.3", undefined],
  ])("%s", (_name, version, expected) => {
    expect(changelogSection(CHANGELOG, version)).toBe(expected);
  });
});

describe("parseTag", () => {
  it.each([
    ["@maple-kit/core@0.17.1", { name: "@maple-kit/core", version: "0.17.1" }],
    ["core", undefined],
  ])("%s", (tag, expected) => {
    expect(parseTag(tag)).toEqual(expected);
  });
});

describe("createArgs", () => {
  it.each([
    [true, "--latest"],
    [false, "--latest=false"],
  ])("latest=%s ends with %s", (latest, flag) => {
    expect(createArgs("@maple-kit/core@1.0.0", latest).at(-1)).toBe(flag);
  });
});
