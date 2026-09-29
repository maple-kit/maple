import { describe, expect, it } from "vitest";

import { decodeVlq, readSourceMap } from "../src/lib/source-map.js";

describe("decodeVlq", () => {
  it.each([
    ["A", [0]],
    ["C", [1]],
    ["D", [-1]],
    ["gB", [16]],
    ["hB", [-16]],
    ["AAgBC", [0, 0, 16, 1]],
    ["qxmvrH", [123_456_789]],
  ] as const)("reads %s", (text, expected) => {
    expect(decodeVlq(text)).toEqual(expected);
  });

  it("refuses a character outside base64", () => {
    expect(() => decodeVlq("A!")).toThrow(RangeError);
  });
});

describe("readSourceMap", () => {
  // Line 1: columns 0 and 4 map to a.ts (0:0) and (0:6). Line 2: column 2 maps to
  // b.ts (line 3, column 1). Line 3 has nothing.
  const map = {
    version: 3,
    sources: ["a.ts", "b.ts"],
    sourceRoot: "src",
    mappings: "AAAA,IAAM;ECEL;",
  };
  const read = readSourceMap(map)!;

  it.each([
    ["the start of a segment", 1, 0, { source: "src/a.ts", line: 1, column: 0 }],
    ["inside the first segment", 1, 3, { source: "src/a.ts", line: 1, column: 0 }],
    ["the second segment", 1, 4, { source: "src/a.ts", line: 1, column: 6 }],
    ["a later line", 2, 9, { source: "src/b.ts", line: 3, column: 1 }],
    ["before the first segment", 2, 1, undefined],
    ["a line with no mappings", 3, 0, undefined],
    ["a line past the end", 9, 0, undefined],
  ] as const)("looks up %s", (_name, line, column, expected) => {
    expect(read(line, column)).toEqual(expected);
  });

  it("keeps an absolute source as the map wrote it", () => {
    const absolute = readSourceMap({ ...map, sources: ["/repo/a.ts"] })!;
    expect(absolute(1, 0)?.source).toBe("/repo/a.ts");
  });

  it.each([
    ["another version", { ...map, version: 2 }],
    ["an index map", { version: 3, sections: [] }],
    ["mappings that are not base64", { ...map, mappings: "!!" }],
  ] as const)("returns nothing for %s", (_name, raw) => {
    expect(readSourceMap(raw)).toBeUndefined();
  });
});
