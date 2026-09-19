import { describe, expect, it } from "vitest";

import { confidenceFor, dataAttributes, formFor } from "../src/data.js";

describe("state on data-*, never in props", () => {
  it("writes the five attributes and nothing else", () => {
    expect(
      dataAttributes({
        status: "needs_reverify",
        form: "partial",
        confidence: "fair",
        provenance: "guest",
        armed: true,
      }),
    ).toEqual({
      "data-status": "needs_reverify",
      "data-form": "partial",
      "data-confidence": "fair",
      "data-provenance": "guest",
      "data-armed": "true",
    });
  });

  it("writes no attribute for state a part did not claim", () => {
    expect(dataAttributes({})).toEqual({});
  });

  it("writes data-armed even when it is false, because unarmed is a state", () => {
    expect(dataAttributes({ armed: false })).toEqual({ "data-armed": "false" });
  });
});

/** Fill says how far through its life a comment is, and nothing else does. */
/**
 * The leaf fills up as a comment goes through its life: open is an outline,
 * re-verify is half, resolved is full. One never written is an outline too.
 */
describe("the mark's fill", () => {
  it.each([
    ["open", true, "outline"],
    ["resolved", true, "solid"],
    ["needs_reverify", true, "partial"],
    ["orphaned", true, "outline"],
    ["open", false, "outline"],
  ] as const)("draws %s (sent: %s) as %s", (status, sent, form) => {
    expect(formFor(status, sent)).toBe(form);
  });

  it("draws an unknown status as an outline rather than blank", () => {
    expect(formFor(undefined)).toBe("outline");
  });
});

describe("the confidence word", () => {
  it.each([
    [1, "certain"],
    [0.95, "certain"],
    [0.9, "strong"],
    [0.752, "fair"],
    [0.5, "weak"],
    [0, "weak"],
  ] as const)("calls %d %s", (value, word) => {
    expect(confidenceFor(value)).toBe(word);
  });
});
