import { describe, expect, it } from "vitest";

import { PLAN_FLOOR, PLAN_TIE, readPlan } from "../src/mock/reading.js";

import type { MockPlan, MockPlanState } from "../src/connectors/types.js";

const LIST = "rest:GET /api/roasts";
const USER = "rest:GET /api/session";

const FLAT = {
  empty: 0.03,
  error: 0.03,
  forbidden: 0.03,
  loading: 0.03,
  one: 0.03,
  many: 0.03,
  long: 0.03,
  sparse: 0.03,
  mixed: 0.03,
  none: 0.03,
};

/** A plan with the given shares, every call concerned unless named otherwise. */
function planOf(shares: Partial<Record<MockPlanState, number>>, concerned = [LIST]): MockPlan {
  const distribution = { ...FLAT, ...shares };
  const state = (Object.keys(shares)[0] ?? "none") as MockPlanState;
  return {
    state,
    distribution,
    confidence: distribution[state],
    calls: [LIST, USER].map((key) => ({ key, concerned: concerned.includes(key), p: 0.9 })),
  };
}

describe("the calm-UI gate", () => {
  it.each<[string, MockPlan | null, { states: string[]; unnamed: boolean }]>([
    ["no plan", null, { states: [], unnamed: false }],
    ["a shrug under 0.4", planOf({ empty: 0.3, error: 0.2 }), { states: [], unnamed: false }],
    ["a sure none", planOf({ none: 0.7 }), { states: [], unnamed: true }],
    ["one clear state", planOf({ empty: 0.7, error: 0.1 }), { states: ["empty"], unnamed: false }],
    [
      "two states within 0.15",
      planOf({ empty: 0.45, error: 0.35 }),
      { states: ["empty", "error"], unnamed: false },
    ],
    ["a state for no call", planOf({ empty: 0.7 }, []), { states: [], unnamed: false }],
  ])("%s", (_name, plan, expected) => {
    const reading = readPlan(plan);
    expect(reading.suggestions.map((suggestion) => suggestion.state)).toEqual(expected.states);
    expect(reading.unnamed).toBe(expected.unnamed);
  });

  it("offers the concerned calls, and only those", () => {
    const [chip] = readPlan(planOf({ empty: 0.7 }, [USER])).suggestions;
    expect(chip?.calls).toEqual([USER]);
  });
});

describe("the gate, with flags and a role", () => {
  const ROASTER = { key: "new-roaster", value: false, concerned: true, p: 0.9 };
  const TIER = { key: "tier", value: "gold", concerned: false, p: 0.2 };
  const layered = (plan: MockPlan, role?: { role: string; p: number }): MockPlan => ({
    ...plan,
    flags: [ROASTER, TIER],
    ...(role === undefined ? {} : { role }),
  });

  it("rides the named flags and role on every state it offers", () => {
    const reading = readPlan(
      layered(planOf({ empty: 0.45, error: 0.35 }), { role: "barista", p: 0.9 }),
    );
    expect(reading.suggestions).toEqual([
      { state: "empty", calls: [LIST], flags: { "new-roaster": false }, as: { role: "barista" } },
      { state: "error", calls: [LIST], flags: { "new-roaster": false }, as: { role: "barista" } },
    ]);
  });

  it.each<[string, MockPlan]>([
    ["a sure none", layered(planOf({ none: 0.7 }), { role: "barista", p: 0.9 })],
    ["a shrug", layered(planOf({ empty: 0.3 }), { role: "barista", p: 0.9 })],
  ])("offers them on their own for %s", (_name, plan) => {
    expect(readPlan(plan)).toEqual({
      suggestions: [{ calls: [], flags: { "new-roaster": false }, as: { role: "barista" } }],
      unnamed: false,
    });
  });

  it("leaves out a flag not concerned and a role under even odds", () => {
    const plan = { ...planOf({ none: 0.7 }), flags: [TIER], role: { role: "guest", p: 0.4 } };
    expect(readPlan(plan)).toEqual({ suggestions: [], unnamed: true });
  });
});

describe("the gate's two numbers", () => {
  it("are the calm-UI thresholds the design names", () => {
    expect([PLAN_FLOOR, PLAN_TIE]).toEqual([0.4, 0.15]);
  });
});
