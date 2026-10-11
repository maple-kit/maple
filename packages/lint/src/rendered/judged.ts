/**
 * The judged tier's consumer: the elements a page's rules chose, put to a
 * `RuleConnector`, and what comes back made to look like every other finding.
 *
 * This file knows only the connector contract. Which model sits behind it is
 * not lint's business, and `eslint.config.js` keeps it that way.
 */

import type { Viewport } from "./audit.js";
import type { Targets } from "./collect.js";
import type { Anchor } from "@maple-kit/core/anchor";
import type { Finding, RuleConnector } from "@maple-kit/core/connectors";

/** What one evaluation gave: findings, or why there are none to trust. */
export interface JudgedResult {
  readonly findings: readonly Finding[];
  /** Set when `evaluate` rejected; the findings are then empty, not clean. */
  readonly error?: string;
}

/** What a judged pass needs besides the connector. */
export interface JudgedPage {
  readonly url: string;
  readonly viewport: Viewport;
  readonly judged: Targets;
}

/** Whether a finding's anchor points at the element a target was read from. */
function sameAnchor(a: Anchor, b: Anchor): boolean {
  if (a.selector !== undefined && b.selector !== undefined) return a.selector === b.selector;
  return a.source === b.source && a.key === b.key && a.component === b.component;
}

/**
 * Says how many identical instances share a finding on a representative, so
 * the reader knows it is not one element's problem. One finding, not N.
 */
function withRepeats(one: Finding, page: Targets): Finding {
  const at = page.targets.findIndex(
    (target) => target.rule === one.rule && sameAnchor(target.anchor, one.anchor),
  );
  const extra = page.repeats[at] ?? 0;
  if (extra === 0) return one;
  const noun = extra === 1 ? "instance" : "instances";
  return { ...one, message: `${one.message} (and ${extra} identical ${noun})` };
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Asks the connector once for one viewport. A finding is the connector's
 * only in what it found: the tier is `judged`, the severity is the rule's
 * (`advice` when it names none), and a rule id the connector does not own is
 * dropped, because a judge inventing rules is not a finding to show anyone.
 *
 * A rejected `evaluate` returns `error` instead of throwing. A judge that is
 * down must not take the rendered tier's findings with it; the caller says
 * the page was not judged, which is what a warning is for.
 */
export async function lintJudged(
  connector: RuleConnector,
  page: JudgedPage,
): Promise<JudgedResult> {
  const { targets } = page.judged;
  if (targets.length === 0) return { findings: [] };
  const rules = new Map(connector.rules.map((rule) => [rule.id, rule]));
  try {
    const found = await connector.evaluate({
      url: page.url,
      viewport: page.viewport,
      targets,
    });
    return {
      findings: found.flatMap((one) => {
        const rule = rules.get(one.rule);
        if (rule === undefined) return [];
        const judged = { ...one, tier: "judged" as const, severity: rule.severity ?? "advice" };
        return [withRepeats(judged, page.judged)];
      }),
    };
  } catch (cause) {
    return { findings: [], error: describe(cause) };
  }
}
