/**
 * Does judging an element with a model beat testing it with a regex?
 *
 * The baseline runs on every CI run: it needs no credential, and it is the
 * floor, since a judge that cannot beat one pattern per rule is not worth its
 * latency. The model tier runs beside it whenever a credential is in the
 * environment, and has to beat the baseline's own score as well as its
 * threshold. The labels are frozen: see cases/design-lint/README.md.
 */

import { readFileSync } from "node:fs";

import { jevRules } from "@maple-kit/classifier";
import { describe, expect, it } from "vitest";

import type { Anchor } from "@maple-kit/core/anchor";
import type { Rule, RuleConnector } from "@maple-kit/core/connectors";

/** One element, the rule it is judged against, and whether it violates it. */
interface Case {
  readonly id: string;
  readonly by: "agent";
  readonly rule: string;
  readonly violation: boolean;
  readonly html: string;
  readonly anchor: Anchor;
}

const CASES: readonly Case[] = JSON.parse(
  readFileSync(new URL("./cases/design-lint/cases.json", import.meta.url), "utf8"),
) as Case[];

/** What jev is asked, one rule at a time. A yes answer is a violation. */
const RULES: readonly Rule[] = [
  {
    id: "design/error-banner-tokens",
    appliesTo: "[role=alert]",
    question:
      "Does this error banner use a raw colour value (hex, rgb, hsl or a named colour such as tomato) anywhere in its styles or icon, instead of a design token such as var(--color-...)? Keywords like currentColor, inherit and transparent are not raw colours, and a hex-like string in the banner's text is not a style.",
  },
  {
    id: "design/destructive-button",
    appliesTo: "button",
    question:
      'Does this button permanently delete, remove, wipe or cancel something the user owns without being styled as destructive (data-variant="destructive")? A button that only dismisses a dialog or removes a filter is not destructive.',
  },
  {
    id: "design/empty-state-cta",
    appliesTo: ".empty-state",
    question:
      "Does this empty state offer no call to action: no link or button that leads the user to what to do next? A control that only dismisses the message is not a call to action.",
  },
  {
    id: "design/truncated-title",
    appliesTo: ".truncate",
    question:
      "Is this label visually truncated with an ellipsis without exposing its full text in a title or an aria-label? A title that does not carry the full text does not count.",
  },
  {
    id: "design/disabled-reason",
    appliesTo: "[disabled]",
    question:
      "Is this control disabled (disabled or aria-disabled) without giving the user a reason, in a title, a tooltip or text it is described by? A title that only says it is disabled is not a reason, and a control that is not disabled is not a violation.",
  },
];

// The baseline scored 0.633. The model threshold is unmeasured and equals it;
// cases/design-lint/README.md says to raise it after the first runs.
const THRESHOLDS = {
  baseline: 0.63,
  model: 0.63,
};

/** One cheap test per rule: what a lint author would write before reaching for a judge. */
const HEURISTICS: Readonly<Record<string, (html: string) => boolean>> = {
  "design/error-banner-tokens": (html) => /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(html),
  "design/destructive-button": (html) =>
    /delete|remove|cancel|discard|clear/i.test(html) && !/data-variant="destructive"/.test(html),
  "design/empty-state-cta": (html) => !/<a\s|<button\s/.test(html),
  "design/truncated-title": (html) =>
    /truncate|text-overflow:\s*ellipsis|line-clamp/.test(html) && !/\btitle="/.test(html),
  "design/disabled-reason": (html) =>
    /disabled/.test(html) && !/\btitle="|aria-describedby/.test(html),
};

const ids = process.env["EVAL_IDS"]?.split(",").map((id) => id.trim());
const chosen = ids === undefined ? CASES : CASES.filter((one) => ids.includes(one.id));
const samples = Math.max(1, Number(process.env["EVAL_SAMPLES"] ?? "1"));

/** A judge's answer to a case: does the element violate the rule? */
type Judge = (one: Case) => Promise<boolean>;

/** Accuracy over every run; with `samples > 1` a case that is right 3 of 5 times is 0.6. */
async function accuracy(judge: Judge): Promise<number> {
  const runs = Array.from({ length: samples }, () => chosen).flat();
  const right = await Promise.all(runs.map(async (one) => (await judge(one)) === one.violation));

  return right.length === 0 ? 1 : right.filter(Boolean).length / right.length;
}

const heuristic: Judge = (one) => Promise.resolve(HEURISTICS[one.rule]?.(one.html) ?? false);

/** One `evaluate` call per case, so a case's answer does not depend on its neighbours. */
function modelJudge(connector: RuleConnector): Judge {
  return async (one) => {
    const findings = await connector.evaluate({
      url: "https://preview.example.test/checkout",
      viewport: { width: 1280, height: 800 },
      targets: [{ rule: one.rule, html: one.html, anchor: one.anchor }],
    });
    return findings.length > 0;
  };
}

const apiKey = process.env["TYPESAFE_API_KEY"] ?? "";

describe("design-lint · the regex baseline", () => {
  it(`is the floor every model has to clear (${String(chosen.length)} cases)`, async () => {
    expect(await accuracy(heuristic)).toBeGreaterThanOrEqual(THRESHOLDS.baseline);
  });

  it("has a heuristic for every rule, and a case of each kind for every rule", () => {
    expect(new Set(RULES.map((rule) => rule.id))).toEqual(new Set(Object.keys(HEURISTICS)));
    for (const rule of RULES) {
      const own = CASES.filter((one) => one.rule === rule.id);
      expect(own.some((one) => one.violation)).toBe(true);
      expect(own.some((one) => !one.violation)).toBe(true);
    }
  });
});

/**
 * Skipped rather than failed without a credential: CI has none, and a suite
 * that goes red because nobody gave it a key teaches people to ignore it.
 */
describe.skipIf(apiKey === "")("design-lint · the model tier", () => {
  it("clears its own threshold, and beats the regex baseline", async () => {
    const model = process.env["MAPLE_AI_MODEL"];
    const jev = jevRules({ apiKey, rules: RULES, ...(model === undefined ? {} : { model }) });

    const [tier, floor] = await Promise.all([accuracy(modelJudge(jev)), accuracy(heuristic)]);

    expect(tier).toBeGreaterThanOrEqual(THRESHOLDS.model);
    expect(tier).toBeGreaterThan(floor);
  }, 300_000);
});
