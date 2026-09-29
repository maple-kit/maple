import { describe, expect, it } from "vitest";

import { mergePlans, splitRequest } from "../src/schema/plan-body.js";
import { SURE } from "./msw/plan.js";

import type { Encode } from "../src/schema/plan-body.js";
import type { MockPlan, MockPlanRequest } from "@maple-kit/core/connectors";

/** A body that weighs what its calls' summaries weigh, and nothing else. */
const byLength: Encode = (request) => {
  const size = request.calls.reduce((sum, call) => sum + call.summary.length, 0);
  return Promise.resolve({ bytes: new Uint8Array(size), gzip: false });
};

function asking(sizes: number[]): MockPlanRequest {
  return {
    request: "no roasts",
    route: "/roasts",
    calls: sizes.map((size, index) => ({
      key: `rest:GET /api/${String(index)}`,
      summary: "x".repeat(size),
    })),
  };
}

describe("splitting a request under a byte budget", () => {
  it.each<[string, number[], number[][]]>([
    ["keeps a request that fits whole", [10, 10, 10], [[10, 10, 10]]],
    ["closes a batch before the call that would overflow it", [40, 40, 40], [[40, 40], [40]]],
    ["never splits a call, even one over the budget", [300, 10], [[300], [10]]],
    ["has nothing to split in a request with no calls", [], [[]]],
  ])("%s", async (_name, sizes, expected) => {
    const parts = await splitRequest(asking(sizes), byLength, 100);

    expect(parts.map((part) => part.calls.map((call) => call.summary.length))).toEqual(expected);
    for (const part of parts) expect(part.request).toBe("no roasts");
  });

  it("keeps every call once, in the order it was asked", async () => {
    const request = asking(Array.from({ length: 25 }, (_unused, index) => 10 + index));
    const parts = await splitRequest(request, byLength, 100);

    expect(parts.flatMap((part) => part.calls)).toEqual(request.calls);
  });
});

describe("merging the plans of many batches", () => {
  const plan = (confidence: number, keys: string[], extra: Partial<MockPlan> = {}): MockPlan => ({
    ...SURE,
    confidence,
    calls: keys.map((key) => ({ key, concerned: true, p: 0.9 })),
    ...extra,
  });

  it("lays the calls end to end and lets the most confident batch name the state", () => {
    const merged = mergePlans([
      plan(0.4, ["a"], { state: "error" }),
      plan(0.9, ["b"], { state: "empty" }),
    ]);

    expect(merged.state).toBe("empty");
    expect(merged.confidence).toBeCloseTo(0.9);
    expect(merged.calls.map(({ key }) => key)).toEqual(["a", "b"]);
  });

  it("keeps each flag's and the role's most certain verdict", () => {
    const flag = (p: number) => ({ key: "new-menu", value: true, concerned: p >= 0.5, p });
    const merged = mergePlans([
      plan(0.5, ["a"], { flags: [flag(0.2)], role: { role: "admin", p: 0.3 } }),
      plan(0.5, ["b"], { flags: [flag(0.8)], role: { role: "guest", p: 0.6 } }),
    ]);

    expect(merged.flags).toEqual([flag(0.8)]);
    expect(merged.role).toEqual({ role: "guest", p: 0.6 });
  });

  it("returns a single plan untouched", () => {
    const only = plan(0.7, ["a"]);
    expect(mergePlans([only])).toBe(only);
  });
});
