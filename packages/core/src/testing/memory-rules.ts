/**
 * A rules connector that judges from a function it was given.
 *
 * It exists so the contract suite and the lint tests can drive the judged
 * tier without a model. Nothing here judges anything: a target is a violation
 * exactly when the options say so.
 */

import type { Finding, Rule, RuleConnector, RuleRequest, RuleTarget } from "../connectors/types.js";

/** Options for {@link memoryRules}. */
export interface MemoryRulesOptions {
  /** Connector name reported to Maple. Defaults to `"memory"`. */
  readonly name?: string;
  /** The rules it declares. Defaults to none. */
  readonly rules?: readonly Rule[];
  /** The message to report for a violating target, or `undefined` for a pass. Defaults to a pass. */
  readonly violation?: (target: RuleTarget, rule: Rule) => string | undefined;
  /** Makes every `evaluate` reject with this error, to exercise a failing judge. */
  readonly failWith?: Error;
}

/** A rules connector plus the history a test asserts on. */
export interface MemoryRules extends RuleConnector {
  /** Every request it was asked to evaluate, oldest first. */
  asked(): readonly RuleRequest[];
  /** Forgets everything, so one test cannot see another's. */
  reset(): void;
}

/** Creates an in-memory rules connector. */
export function memoryRules(options: MemoryRulesOptions = {}): MemoryRules {
  const rules = options.rules ?? [];
  const requests: RuleRequest[] = [];

  return {
    name: options.name ?? "memory",
    rules,
    evaluate(request: RuleRequest): Promise<readonly Finding[]> {
      requests.push(request);
      if (options.failWith) return Promise.reject(options.failWith);
      return Promise.resolve(judge(rules, request, options.violation));
    },
    asked(): readonly RuleRequest[] {
      return requests;
    },
    reset(): void {
      requests.length = 0;
    },
  };
}

/** A target naming a rule nobody declared is skipped, never reported. */
function judge(
  rules: readonly Rule[],
  request: RuleRequest,
  violation: MemoryRulesOptions["violation"],
): Finding[] {
  const findings: Finding[] = [];
  for (const target of request.targets) {
    const rule = rules.find((candidate) => candidate.id === target.rule);
    const message = rule && violation?.(target, rule);
    if (!rule || !message) continue;
    findings.push({
      rule: rule.id,
      tier: "judged",
      severity: rule.severity ?? "advice",
      message,
      anchor: target.anchor,
    });
  }
  return findings;
}
