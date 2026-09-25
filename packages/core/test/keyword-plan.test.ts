import { describe, expect, it } from "vitest";

import { keywordPlan } from "../src/connectors/keyword-plan.js";
import { plannedCall, stateFromWeights } from "../src/connectors/plan.js";

import type { MockPlanCall, MockPlanState } from "../src/connectors/types.js";

const CALLS: readonly MockPlanCall[] = [
  { key: "trpc:roast.list", summary: "Roast[]: every roast, newest first" },
  { key: "trpc:bean.listByOrigin", summary: "Bean[]: beans from one origin" },
  { key: "trpc:user.me", summary: "User: who is signed in" },
  { key: "rest:POST /api/roasts", summary: "Roast: creates a roast" },
  { key: "trpc:roast.archive", summary: "mutation: archives a roast" },
];

function plan(request: string): ReturnType<typeof keywordPlan> {
  return keywordPlan({ request, route: "/roasts", calls: CALLS });
}

function concerned(request: string): string[] {
  return plan(request)
    .calls.filter((call) => call.concerned)
    .map((call) => call.key);
}

describe("the keyword planner's state", () => {
  const cases: readonly { request: string; state: MockPlanState }[] = [
    { request: "mock this page with an empty state", state: "empty" },
    { request: "what if there are no roasts yet", state: "empty" },
    { request: "first-time user with nothing", state: "empty" },
    { request: "the roast list fails to load with a 500", state: "error" },
    { request: "server is down", state: "error" },
    { request: "user without permission to see beans", state: "forbidden" },
    { request: "403 on the roast list", state: "forbidden" },
    { request: "no access to origins", state: "forbidden" },
    { request: "show the skeleton while it's loading", state: "loading" },
    { request: "just one roast", state: "one" },
    { request: "a single bean", state: "one" },
    { request: "lots of roasts, enough to paginate", state: "many" },
    { request: "hundreds of beans", state: "many" },
    { request: "make the header blue", state: "none" },
    { request: "", state: "none" },
  ];

  it.each(cases)("reads “$request” as $state", ({ request, state }) => {
    expect(plan(request).state).toBe(state);
  });

  it("is less sure of a sentence that names two states than of one naming one", () => {
    expect(plan("empty or error").confidence).toBeLessThan(plan("empty").confidence);
  });

  it("is surer of a sentence that says a state twice over", () => {
    expect(plan("empty, nothing at all").confidence).toBeGreaterThan(plan("empty").confidence);
  });
});

describe("the keyword planner's calls", () => {
  const cases: readonly { request: string; calls: readonly string[]; why: string }[] = [
    {
      request: "empty roast list",
      calls: ["trpc:roast.list", "rest:POST /api/roasts", "trpc:roast.archive"],
      why: "every call that shares a word, writes included",
    },
    {
      request: "no beans",
      calls: ["trpc:bean.listByOrigin"],
      why: "a plural folds onto the key's singular",
    },
    {
      request: "beans from one origin",
      calls: ["trpc:bean.listByOrigin"],
      why: "a camel-cased key splits into words",
    },
    {
      request: "mock this page with an empty state",
      calls: ["trpc:roast.list", "trpc:bean.listByOrigin", "trpc:user.me"],
      why: "a sentence naming no call is about the page, writes aside",
    },
  ];

  it.each(cases)("“$request”: $why", ({ request, calls }) => {
    expect(concerned(request)).toEqual(calls);
  });

  it("ranks the call that shares the most words above one that shares fewer", () => {
    const [roasts, , , create] = plan("every roast newest first").calls;
    expect(roasts?.p).toBeGreaterThan(create?.p ?? 1);
  });

  it("answers a route with no calls with no verdicts", () => {
    expect(keywordPlan({ request: "empty", route: "/", calls: [] }).calls).toEqual([]);
  });
});

describe("the plan arithmetic", () => {
  it("reads evidence for nothing as none, and none as the surest of a shrug", () => {
    const guess = stateFromWeights({});
    expect(guess.state).toBe("none");
    expect(guess.confidence).toBe(guess.distribution.none);
  });

  it("breaks a tie toward the earlier state", () => {
    expect(stateFromWeights({ one: 1, empty: 1 }).state).toBe("empty");
  });

  it.each([
    { p: 0.5, concerned: true },
    { p: 0.49, concerned: false },
    { p: 2, concerned: true },
    { p: -1, concerned: false },
  ])("derives concerned from p = $p", ({ p, concerned: expected }) => {
    const call = plannedCall("k", p);
    expect(call.concerned).toBe(expected);
    expect(call.p).toBeGreaterThanOrEqual(0);
    expect(call.p).toBeLessThanOrEqual(1);
  });
});
