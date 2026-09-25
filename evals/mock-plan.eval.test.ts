/**
 * Does planning a mock with a model beat planning it with a word list?
 *
 * Each case pairs a reviewer's sentence with the calls a page made, and is
 * scored twice: whether the state is the one meant, and how well the calls
 * the plan concerns match the ones meant (F1). cases/mock-plan says where
 * every case and inventory came from.
 */

import { readFileSync } from "node:fs";

import { jevClassifier } from "@maple-kit/classifier";
import { keywordClassifier } from "@maple-kit/core/connectors";
import { describe, expect, it } from "vitest";

import type { ClassifierConnector, MockPlanCall, MockPlanState } from "@maple-kit/core/connectors";

/** A page's calls, as the route hands them to a planner. */
interface Inventory {
  readonly source: "recorded" | "written";
  readonly route: string;
  readonly calls: readonly MockPlanCall[];
}

/** One sentence, and the answers a reader would not argue with. */
interface Case {
  readonly id: string;
  readonly by: "agent" | "maintainer" | "reviewer";
  readonly inventory: string;
  readonly request: string;
  readonly state: MockPlanState;
  /** The calls it must concern. Absent: the calls are not scored. */
  readonly calls?: readonly string[];
  /** Calls a reader could argue either way, scored neither way. */
  readonly maybe?: readonly string[];
}

function read<T>(name: string): T {
  return JSON.parse(
    readFileSync(new URL(`./cases/mock-plan/${name}`, import.meta.url), "utf8"),
  ) as T;
}

const INVENTORIES = read<Readonly<Record<string, Inventory>>>("inventories.json");
const CASES = read<readonly Case[]>("cases.json");

/**
 * Measured, not chosen: keyword 92.3/67.6, jev 94.4/76.7 over three samples
 * when these were set, each sitting just under. Raised, never lowered.
 */
const THRESHOLDS = {
  keyword: { state: 0.9, calls: 0.65 },
  model: { state: 0.92, calls: 0.74 },
};

const ids = process.env["EVAL_IDS"]?.split(",").map((id) => id.trim());
const chosen = ids === undefined ? CASES : CASES.filter((one) => ids.includes(one.id));
const samples = Math.max(1, Number(process.env["EVAL_SAMPLES"] ?? "1"));

/** A tier's score over the set: state accuracy, and mean call F1. */
interface Report {
  readonly state: number;
  readonly calls: number;
}

async function score(connector: ClassifierConnector): Promise<Report> {
  const runs = Array.from({ length: samples }, () => chosen).flat();
  const results = await Promise.all(runs.map((one) => judge(connector, one)));
  const misses = results.filter((result) => result.state === 0).map((result) => result.id);
  if (process.env["EVAL_VERBOSE"] !== undefined) {
    process.stdout.write(`${connector.name} state misses: ${[...new Set(misses)].join(", ")}\n`);
  }

  return {
    state: mean(results.map((result) => result.state)),
    calls: mean(results.flatMap((result) => (result.calls === undefined ? [] : [result.calls]))),
  };
}

interface Scored {
  readonly id: string;
  readonly state: number;
  readonly calls?: number;
}

async function judge(connector: ClassifierConnector, one: Case): Promise<Scored> {
  const inventory = INVENTORIES[one.inventory];
  if (inventory === undefined) throw new Error(`${one.id}: no inventory "${one.inventory}"`);
  const plan = await connector.plan?.({
    request: one.request,
    route: inventory.route,
    calls: inventory.calls,
  });
  if (plan === undefined) throw new Error(`${connector.name} does not plan`);

  const state = plan.state === one.state ? 1 : 0;
  if (one.calls === undefined || one.state === "none") return { id: one.id, state };

  const maybe = new Set(one.maybe ?? []);
  const chosenCalls = plan.calls.filter((call) => call.concerned && !maybe.has(call.key));
  return { id: one.id, state, calls: f1(new Set(chosenCalls.map((call) => call.key)), one.calls) };
}

/** Both empty is a perfect score: the case says no call, and none was chosen. */
function f1(chosenKeys: ReadonlySet<string>, meant: readonly string[]): number {
  if (chosenKeys.size === 0 && meant.length === 0) return 1;
  const hit = meant.filter((key) => chosenKeys.has(key)).length;
  return (2 * hit) / (chosenKeys.size + meant.length);
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 1 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

const apiKey = process.env["TYPESAFE_API_KEY"] ?? "";

describe("mock plan · the keyword planner", () => {
  it(`is the floor every model has to clear (${String(chosen.length)} cases)`, async () => {
    const report = await score(keywordClassifier());
    if (process.env["EVAL_VERBOSE"] !== undefined)
      process.stdout.write(`keyword ${JSON.stringify(report)}\n`);

    expect(report.state).toBeGreaterThanOrEqual(THRESHOLDS.keyword.state);
    expect(report.calls).toBeGreaterThanOrEqual(THRESHOLDS.keyword.calls);
  });
});

/** Skipped rather than failed without a credential, as the assist eval is. */
describe.skipIf(apiKey === "")("mock plan · the model tier", () => {
  it("clears its own threshold, and beats the word list on both scorers", async () => {
    const model = process.env["MAPLE_AI_MODEL"];
    const jev = jevClassifier({ apiKey, ...(model === undefined ? {} : { model }) });

    const [tier, floor] = await Promise.all([score(jev), score(keywordClassifier())]);
    if (process.env["EVAL_VERBOSE"] !== undefined)
      process.stdout.write(`jev ${JSON.stringify(tier)}\n`);

    expect(tier.state).toBeGreaterThanOrEqual(THRESHOLDS.model.state);
    expect(tier.calls).toBeGreaterThanOrEqual(THRESHOLDS.model.calls);
    expect(tier.state).toBeGreaterThan(floor.state);
    expect(tier.calls).toBeGreaterThan(floor.calls);
  }, 180_000);
});
