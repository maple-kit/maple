/**
 * The numbers the demo renders. Fixed, not generated: a comment left on "the
 * churn row" has to still be about that row on the next load, or the anchor
 * cascade is being tested against noise.
 */

export interface Metric {
  readonly name: string;
  readonly value: string;
  readonly delta: number;
  readonly note: string;
}

export const METRICS: readonly Metric[] = [
  { name: "Active teams", value: "1,284", delta: 4.2, note: "vs. the 28 days before" },
  { name: "Reviews merged", value: "318", delta: -1.8, note: "gate enforced on 41 of them" },
  { name: "Median time to merge", value: "4h 12m", delta: -22.6, note: "since the gate landed" },
  { name: "Comments per review", value: "3.4", delta: 0.9, note: "unpinned excluded" },
];

export interface Row {
  readonly repo: string;
  readonly branch: string;
  readonly open: number;
  readonly state: "blocked" | "clear" | "waiting";
  readonly reviewer: string;
}

export const ROWS: readonly Row[] = [
  { repo: "maple-kit/maple", branch: "feat/ui-picker", open: 3, state: "blocked", reviewer: "Ada" },
  { repo: "maple-kit/maple", branch: "fix/anchor-quote", open: 0, state: "clear", reviewer: "Ada" },
  { repo: "maple-kit/site", branch: "feat/pricing", open: 1, state: "waiting", reviewer: "Grace" },
  { repo: "maple-kit/site", branch: "chore/deps", open: 0, state: "clear", reviewer: "Alan" },
  { repo: "maple-kit/action", branch: "feat/gate", open: 2, state: "blocked", reviewer: "Grace" },
];

/** Twelve weeks of merged reviews, for the chart's bars. */
export const WEEKS: readonly number[] = [12, 18, 14, 22, 26, 21, 30, 28, 35, 31, 38, 42];
