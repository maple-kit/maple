/**
 * The judged tier's consumer: the elements a page's rules chose, put to a
 * `RuleConnector`, and what comes back made to look like every other finding.
 *
 * This file knows only the connector contract. Which model sits behind it is
 * not lint's business, and `eslint.config.js` keeps it that way.
 */

import type { Viewport } from "./audit.js";
import type { Targets } from "./collect.js";
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
        return [{ ...one, tier: "judged" as const, severity: rule.severity ?? "advice" }];
      }),
    };
  } catch (cause) {
    return { findings: [], error: describe(cause) };
  }
}
