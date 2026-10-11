/**
 * What the judged tier did not look at, in words. None of it changes a
 * conclusion; it is there so "no findings" is never read as "all checked".
 */

import type { JudgedStats } from "@maple-kit/lint";

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/** One line on what was judged, then one per rule that should be narrowed or is broken. */
export function describeJudgedStats(stats: JudgedStats): readonly string[] {
  const parts = [
    `Judged ${String(stats.sent)} of ${String(stats.matched)} matches (${plural(stats.groups, "group", "groups")})`,
  ];
  if (stats.rulesAtCap.length > 0) {
    const hit =
      stats.rulesAtCap.length === 1 ? "1 rule hit" : `${String(stats.rulesAtCap.length)} rules hit`;
    parts.push(`${hit} the cap: ${stats.rulesAtCap.join(", ")}`);
  }
  if (stats.notChanged > 0) parts.push(`skipped ${String(stats.notChanged)} unchanged`);
  const lines = [parts.join("; ")];
  if (stats.broadRules.length > 0) {
    lines.push(`Narrow \`appliesTo\` for: ${stats.broadRules.join(", ")}`);
  }
  if (stats.invalidSelectors.length > 0) {
    lines.push(
      `Not a valid selector, so nothing was judged for: ${stats.invalidSelectors.join(", ")}`,
    );
  }
  return lines;
}
