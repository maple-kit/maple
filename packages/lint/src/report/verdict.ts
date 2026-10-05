/**
 * What a lint run says about itself: a conclusion, a title and a summary.
 *
 * The same words go into a check run and into a terminal, so a person running
 * the lint locally reads what the pull request will say.
 */

import { describePlace } from "./place.js";

import type { Finding } from "../types.js";

/** `neutral` is a run that could not judge, which must not block a merge. */
export type Conclusion = "failure" | "neutral" | "success";

/** The outcome of a run. */
export interface Verdict {
  readonly conclusion: Conclusion;
  readonly title: string;
  /** Markdown. */
  readonly summary: string;
}

/** The most findings a summary lists; the rest are counted. */
const LISTED = 50;

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? "" : "s"}`;
}

/** The findings, grouped by rule in the order the rules first appear. */
export function groupByRule(findings: readonly Finding[]): ReadonlyMap<string, readonly Finding[]> {
  const groups = new Map<string, Finding[]>();
  for (const found of findings) groups.set(found.rule, [...(groups.get(found.rule) ?? []), found]);
  return groups;
}

function listing(findings: readonly Finding[], root?: string): string {
  const lines: string[] = [];
  for (const [rule, group] of groupByRule(findings)) {
    lines.push(`### \`${rule}\` (${plural(group.length, "finding")})`, "");
    for (const found of group) {
      const place = describePlace(found, root);
      const where = place === "" ? "" : `\`${place}\` `;
      lines.push(`- ${where}${found.message}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

/** Success unless a finding is an error; warnings and advice are reported and never block. */
export function verdictFor(findings: readonly Finding[], root?: string): Verdict {
  const errors = findings.filter((found) => found.severity === "error").length;
  if (findings.length === 0) {
    return { conclusion: "success", title: "No design findings", summary: "No design findings." };
  }
  const shown = findings.slice(0, LISTED);
  const rest = findings.length - shown.length;
  const counts = `${plural(errors, "error")}, ${plural(findings.length - errors, "other finding")}`;
  const more = rest > 0 ? `\n\n…and ${String(rest)} more.` : "";
  return {
    conclusion: errors > 0 ? "failure" : "success",
    title: `Design lint: ${counts}`,
    summary: `${listing(shown, root)}${more}`,
  };
}

/** The verdict for a preview that could not be loaded: nothing was judged, so nothing blocks. */
export function unreachableVerdict(url: string, reason: string): Verdict {
  return {
    conclusion: "neutral",
    title: "Preview not reachable",
    summary: `Maple could not load ${url}, so nothing was checked.\n\n${reason}`,
  };
}
