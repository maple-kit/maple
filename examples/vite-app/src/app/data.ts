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
  /** What the table keys a row by, as a real API's rows carry one. */
  readonly id: string;
  readonly repo: string;
  readonly branch: string;
  readonly open: number;
  readonly state: "blocked" | "clear" | "waiting";
  readonly reviewer: string;
  /** Which of the page's avatar tints the reviewer is drawn in. */
  readonly tint: number;
}

export const ROWS: readonly Row[] = [
  {
    id: "rv_1",
    repo: "maple-kit/maple",
    branch: "feat/ui-picker",
    open: 3,
    state: "blocked",
    reviewer: "Ada",
    tint: 0,
  },
  {
    id: "rv_2",
    repo: "maple-kit/maple",
    branch: "fix/anchor-quote",
    open: 0,
    state: "clear",
    reviewer: "Ada",
    tint: 0,
  },
  {
    id: "rv_3",
    repo: "maple-kit/site",
    branch: "feat/pricing",
    open: 1,
    state: "waiting",
    reviewer: "Grace",
    tint: 1,
  },
  {
    id: "rv_4",
    repo: "maple-kit/site",
    branch: "chore/deps",
    open: 0,
    state: "clear",
    reviewer: "Alan",
    tint: 2,
  },
  {
    id: "rv_5",
    repo: "maple-kit/action",
    branch: "feat/gate",
    open: 2,
    state: "blocked",
    reviewer: "Grace",
    tint: 1,
  },
];

/** Twelve weeks of merged reviews, for the chart's bars. */
export const WEEKS: readonly number[] = [12, 18, 14, 22, 26, 21, 30, 28, 35, 31, 38, 42];

/** The week the gate landed, zero-based, which the chart marks. */
export const GATE_WEEK = 6;

export interface AuditEvent {
  readonly id: string;
  readonly who: string;
  readonly what: string;
  readonly when: string;
}

/** What `GET /api/audit` answers an owner. */
export const AUDIT: readonly AuditEvent[] = [
  {
    id: "a3",
    who: "Ada",
    what: "turned the merge gate on for maple-kit/site",
    when: "2026-09-24T16:10:00Z",
  },
  {
    id: "a2",
    who: "Grace",
    what: "added a reviewer to maple-kit/maple",
    when: "2026-09-23T09:42:00Z",
  },
  { id: "a1", who: "Ada", what: "changed the digest to daily", when: "2026-09-22T12:05:00Z" },
];

/** What the preview's fake LaunchDarkly answers, in its FDv1 poll format. */
export const LD_FLAGS = {
  "merge-forecast": { value: false, variation: 1, version: 3, flagVersion: 2, trackEvents: false },
};
