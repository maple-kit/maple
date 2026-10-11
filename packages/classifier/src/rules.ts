/**
 * The jev rules connector: Maple's judged design-lint tier backed by a System
 * One model.
 *
 * Every (rule, element) pair is one `noul` question, and the questions for a
 * page travel in ONE request whenever they fit: jev reads the page once and
 * answers them all in parallel. jev takes 64k tokens a request, 32k of them
 * state, so a page whose elements do not fit is split into a few requests.
 * Choosing and truncating elements is the caller's: lint does both.
 */

import { openSystemOne } from "./internal/systemone.js";

import type { SystemOne } from "./internal/systemone.js";
import type { NoulQuestion, Question } from "./questions.js";
import type {
  Finding,
  Rule,
  RuleConnector,
  RuleRequest,
  RuleTarget,
} from "@maple-kit/core/connectors";

/** How a deployment reaches a System One model to judge rules. */
export interface JevRulesOptions {
  /** Read on the server or in CI, never in a browser. */
  readonly apiKey: string;
  /** What to judge. Each question is answered yes when the element violates the rule. */
  readonly rules: readonly Rule[];
  /** The API root `/systemone` is appended to, defaulting to TypeSafe's own. */
  readonly baseUrl?: string | undefined;
  /** An alias or a pinned version. Defaults to the flagship alias. */
  readonly model?: string | undefined;
  /** The probability at or above which an element is flagged. Defaults to 0.5. */
  readonly threshold?: number | undefined;
  /** How long one request may take before it is abandoned. Defaults to 60 s. */
  readonly timeoutMs?: number | undefined;
}

/** The alias, not a pinned version, as the classifier does. */
const DEFAULT_MODEL = "jev-latest";

/** A CI run waits for a whole page's batch; nobody is typing. */
export const DEFAULT_RULES_TIMEOUT_MS = 60_000;

/** The probability of yes that counts as a violation, as the planner uses. */
export const DEFAULT_RULES_THRESHOLD = 0.5;

/** One request's state: 80k characters is ~27k tokens, under jev's 32k for state plus a question. */
export const MAX_REQUEST_STATE_CHARS = 80_000;

/** Builds the connector. Nothing is requested until `evaluate` is called with targets. */
export function jevRules(options: JevRulesOptions): RuleConnector {
  const threshold = options.threshold ?? DEFAULT_RULES_THRESHOLD;
  const byId = new Map(options.rules.map((rule) => [rule.id, rule]));
  let system: SystemOne | undefined;

  return {
    name: "jev",
    rules: options.rules,

    async evaluate(request: RuleRequest): Promise<readonly Finding[]> {
      const { targets } = request;
      const judged = targets.map((target) => ({ target, rule: ruleFor(byId, target) }));
      const batches = batchesOf(judged);
      if (batches.length === 0) return [];

      system ??= openSystemOne({
        apiKey: options.apiKey,
        baseUrl: options.baseUrl,
        model: options.model ?? DEFAULT_MODEL,
        timeoutMs: options.timeoutMs ?? DEFAULT_RULES_TIMEOUT_MS,
      });
      const open = system;
      const found = await Promise.all(
        batches.map((batch) => judgeBatch(open, request, batch, threshold)),
      );
      return found.flat();
    },
  };
}

interface Judged {
  readonly rule: Rule;
  readonly target: RuleTarget;
}

/** The rule a target names, or a plain error: a target nothing can judge is a caller bug. */
function ruleFor(byId: ReadonlyMap<string, Rule>, target: RuleTarget): Rule {
  const rule = byId.get(target.rule);
  if (rule === undefined) throw new Error(`jev rules have no rule "${target.rule}".`);
  return rule;
}

/**
 * Groups elements, in order, so no request's HTML passes the state budget. An
 * element that alone passes it rejects: selecting and truncating is the caller's.
 */
function batchesOf(judged: readonly Judged[]): Judged[][] {
  const batches: Judged[][] = [];
  let size = 0;
  for (const item of judged) {
    const length = item.target.html.length;
    if (length > MAX_REQUEST_STATE_CHARS) {
      throw new Error(
        `jev rule "${item.rule.id}" was given an element of ${length} characters; one request holds ${MAX_REQUEST_STATE_CHARS}. The caller must truncate it first (lint does).`,
      );
    }
    const last = batches.at(-1);
    if (last === undefined || size + length > MAX_REQUEST_STATE_CHARS) {
      batches.push([item]);
      size = length;
    } else {
      last.push(item);
      size += length;
    }
  }
  return batches;
}

/** Asks one request's questions and flags the elements whose answer reaches the threshold. */
async function judgeBatch(
  system: SystemOne,
  request: RuleRequest,
  batch: readonly Judged[],
  threshold: number,
): Promise<Finding[]> {
  const questions: Record<string, Question> = {};
  batch.forEach(({ rule }, index) => {
    questions[targetKey(index)] = ruleQuestion(index, rule);
  });

  const answers = await system.ask({
    connector: "jev",
    operation: "evaluate",
    questions,
    signal: undefined,
    state: {
      page: { url: request.url, viewport: { ...request.viewport } },
      targets: batch.map(({ target }) => ({ html: target.html })),
    },
  });

  const findings: Finding[] = [];
  batch.forEach(({ rule, target }, index) => {
    const p = probabilityAt(answers[targetKey(index)]?.noul, targetKey(index));
    if (p >= threshold) findings.push(findingFor(rule, target, p));
  });
  return findings;
}

/** The key one element's question is asked and answered under. */
function targetKey(index: number): string {
  return `target:${index}`;
}

/** One rule asked of one element, as a `noul` that is high when the element violates it. */
function ruleQuestion(index: number, rule: Rule): NoulQuestion {
  return {
    type: "noul",
    instructions:
      `\`targets[${index}].html\` is one element of the rendered page \`page\`.` +
      ` Answer yes if this holds of it: ${rule.question}`,
    criteria: {
      true: "The element is a clear violation of the rule the question describes.",
      false: "The element satisfies the rule, or the rule does not clearly apply to it.",
    },
  };
}

/** A missing or non-numeric probability is a broken provider, not a pass. */
function probabilityAt(noul: unknown, key: string): number {
  if (typeof noul !== "number" || !Number.isFinite(noul) || noul < 0 || noul > 1) {
    throw new Error(`jev returned no probability for "${key}".`);
  }
  return noul;
}

function findingFor(rule: Rule, target: RuleTarget, p: number): Finding {
  return {
    rule: rule.id,
    tier: "judged",
    severity: rule.severity ?? "advice",
    message: `${rule.question} Judged yes (p=${p.toFixed(2)}).`,
    anchor: target.anchor,
  };
}
