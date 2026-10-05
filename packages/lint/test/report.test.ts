import { describe, expect, it } from "vitest";

import { annotationsFor } from "../src/report/check-run.js";
import { describePlace, placeOf } from "../src/report/place.js";
import { toSarif } from "../src/report/sarif.js";
import { unreachableVerdict, verdictFor } from "../src/report/verdict.js";

import type { Finding } from "../src/types.js";

function finding(over: Partial<Finding> = {}): Finding {
  return {
    rule: "maple/rendered-contrast",
    tier: "rendered",
    severity: "error",
    message: "Text is 2.1:1 on its background.",
    anchor: { source: "src/Button.tsx:12:5", selector: "button" },
    ...over,
  };
}

describe("placeOf", () => {
  it.each([
    ["src/a.tsx:12:5", undefined, { path: "src/a.tsx", line: 12, column: 5 }],
    ["./src/a.tsx:12", undefined, { path: "src/a.tsx", line: 12 }],
    ["/repo/src/a.tsx:3:1", "/repo", { path: "src/a.tsx", line: 3, column: 1 }],
    ["/elsewhere/a.tsx:3:1", "/repo", undefined],
    ["/repo/a.tsx:3:1", undefined, undefined],
    ["no-line", undefined, undefined],
  ])("reads %s", (source, root, expected) => {
    expect(placeOf(finding({ anchor: { source } }), root)).toEqual(expected);
  });

  it("falls back to the selector to describe a finding with no file", () => {
    expect(describePlace(finding({ anchor: { selector: "nav > a" } }))).toBe("nav > a");
  });
});

describe("toSarif", () => {
  it("anchors a tagged finding to its file and an untagged one to its selector", () => {
    const log = toSarif([finding(), finding({ anchor: { selector: "nav > a" } })]);
    const run = log.runs[0] as { results: { level: string; locations: unknown[] }[] };

    expect(run.results[0]?.locations[0]).toEqual({
      physicalLocation: {
        artifactLocation: { uri: "src/Button.tsx" },
        region: { startLine: 12, startColumn: 5 },
      },
    });
    expect(run.results[1]?.locations[0]).toEqual({
      logicalLocations: [{ name: "nav > a", kind: "element" }],
    });
    expect(run.results[0]?.level).toBe("error");
  });
});

describe("verdicts", () => {
  it("fails on an error, passes on a warning, and is neutral when unreachable", () => {
    expect(verdictFor([finding()]).conclusion).toBe("failure");
    expect(verdictFor([finding({ severity: "warn" })]).conclusion).toBe("success");
    expect(verdictFor([]).conclusion).toBe("success");
    expect(unreachableVerdict("https://x.test", "down").conclusion).toBe("neutral");
  });

  it("annotates only findings that name a file", () => {
    const found = [finding(), finding({ anchor: { selector: "a" } })];
    expect(annotationsFor(found)).toHaveLength(1);
  });
});
