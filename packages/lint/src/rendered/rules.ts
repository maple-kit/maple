/**
 * The rendered rules: pure functions from a collected record to findings.
 *
 * Every rule here judges a value the browser resolved, which is the whole
 * point of the tier — a static linter cannot see what the cascade, a theme and
 * a media query finally produced. Keeping them pure keeps them table-tested.
 */

import { colorKey, contrastRatio, isUnreadableColor, over, parseColor } from "../color.js";
import { type TokenSet } from "../tokens.js";

import type { Rgb } from "../color.js";
import type { StyleRecord } from "./collect.js";
import type { Finding, Severity } from "@maple-kit/core/connectors";

/** What a rule is, for the docs table and for a host overriding a severity. */
export interface RuleDefinition {
  readonly id: string;
  readonly severity: Severity;
  /** One line, the same sentence the docs table shows. */
  readonly summary: string;
}

/** The properties motion is allowed on: the two the compositor can animate. */
export const MOTION_SAFE = ["opacity", "transform"] as const;

/** Smallest touch target that is not a finding, from WCAG 2.5.8 AA. */
export const MIN_TOUCH_TARGET = 24;

const DOCS = "https://github.com/maple-kit/maple/blob/main/docs/lint.md";

/** Every rendered rule, in the order the docs list them. */
export const RENDERED_RULES: readonly RuleDefinition[] = [
  {
    id: "maple/rendered-color-token",
    severity: "error",
    summary: "Colours come from the token set.",
  },
  {
    id: "maple/rendered-type-scale",
    severity: "error",
    summary: "Font sizes come from the type scale.",
  },
  {
    id: "maple/rendered-touch-target",
    severity: "error",
    summary: `Interactive elements are at least ${MIN_TOUCH_TARGET}px on both axes.`,
  },
  { id: "maple/rendered-contrast", severity: "error", summary: "Text meets WCAG AA contrast." },
  {
    id: "maple/rendered-motion-property",
    severity: "error",
    summary: "Motion animates only opacity and transform.",
  },
  {
    id: "maple/rendered-reduced-motion",
    severity: "error",
    summary: "Motion stops under prefers-reduced-motion.",
  },
];

const SEVERITY = new Map(RENDERED_RULES.map((rule) => [rule.id, rule.severity]));

function finding(rule: string, record: StyleRecord, message: string): Finding {
  return {
    rule,
    tier: "rendered",
    severity: SEVERITY.get(rule) ?? "warn",
    message,
    anchor: record.anchor,
    url: `${DOCS}#${rule.replace("maple/", "")}`,
  };
}

/**
 * Whether a colour is a token, at any alpha. Secondary text is often the ink
 * token at 60%, and that is the token in use, not a raw colour beside it.
 */
function isTokenColor(color: Rgb, tokens: TokenSet): boolean {
  return tokens.colors.has(colorKey(color)) || tokens.colors.has(colorKey({ ...color, a: 1 }));
}

/** A colour the token set does not declare, for text and for a painted background. */
export function colorFindings(record: StyleRecord, tokens: TokenSet): Finding[] {
  const rule = "maple/rendered-color-token";
  // No token set is a misconfigured run, not a page where every colour is
  // wrong. The type scale already reads it that way; a run warns instead.
  if (tokens.colors.size === 0) return [];
  const checked: [string, string][] = [
    ["text colour", record.color],
    ["background", record.backgroundColor],
  ];
  return checked.flatMap(([what, value]) => {
    const color = parseColor(value);
    if (!color || color.a === 0 || isTokenColor(color, tokens)) return [];
    return [finding(rule, record, `The ${what} ${value} is not a token.`)];
  });
}

/** A font size off the scale. A record with no text is still laid out, so it counts. */
export function typeScaleFindings(record: StyleRecord, tokens: TokenSet): Finding[] {
  if (tokens.fontSizes.size === 0 || tokens.fontSizes.has(record.fontSize)) return [];
  const scale = [...tokens.fontSizes].sort((first, second) => first - second).join("px, ");
  return [
    finding(
      "maple/rendered-type-scale",
      record,
      `The font size ${record.fontSize}px is off the scale (${scale}px).`,
    ),
  ];
}

/** An interactive element a finger cannot reliably hit. */
export function touchTargetFindings(record: StyleRecord): Finding[] {
  const tooSmall = record.width < MIN_TOUCH_TARGET || record.height < MIN_TOUCH_TARGET;
  if (!record.interactive || !tooSmall || record.width === 0 || record.height === 0) return [];
  const size = `${Math.round(record.width)}×${Math.round(record.height)}px`;
  return [
    finding(
      "maple/rendered-touch-target",
      record,
      `This ${record.tag} is ${size}, under the ${MIN_TOUCH_TARGET}px touch target.`,
    ),
  ];
}

/** Large text as WCAG defines it, which is a lower bar than the body threshold. */
function isLargeText(record: StyleRecord): boolean {
  return record.fontSize >= 24 || (record.fontSize >= 18.66 && record.fontWeight >= 700);
}

/** Text that does not meet WCAG AA against what is actually behind it. */
export function contrastFindings(record: StyleRecord): Finding[] {
  if (!record.paintsText || record.text === "") return [];
  const foreground = parseColor(record.color);
  const backdrop = parseColor(record.backdrop);
  if (!foreground || !backdrop) return [];
  const ratio = contrastRatio(over(foreground, backdrop), backdrop);
  const required = isLargeText(record) ? 3 : 4.5;
  if (ratio >= required) return [];
  return [
    finding(
      "maple/rendered-contrast",
      record,
      `Contrast is ${ratio.toFixed(2)}:1, under the ${required}:1 this text needs.`,
    ),
  ];
}

/** Property names a transition names, expanded from the shorthand. */
function transitioned(record: StyleRecord): string[] {
  return record.transitionProperty
    .split(",")
    .map((property) => property.trim())
    .filter((property) => property !== "" && property !== "none");
}

/** Whether a duration list is all zero, which is what "no motion" computes to. */
function isStill(duration: string): boolean {
  return duration
    .split(",")
    .every((value) => Number.parseFloat(value) === 0 || Number.isNaN(Number.parseFloat(value)));
}

/** Motion on a property the compositor cannot animate cheaply. */
export function motionPropertyFindings(record: StyleRecord): Finding[] {
  const rule = "maple/rendered-motion-property";
  const safe = (property: string): boolean => (MOTION_SAFE as readonly string[]).includes(property);
  const moving = isStill(record.transitionDuration) ? [] : transitioned(record);
  const animated = isStill(record.animationDuration) ? [] : record.animationProperties;
  const offending = [...new Set([...moving, ...animated])].filter((property) => !safe(property));
  if (offending.length === 0) return [];
  return [finding(rule, record, `Motion is on ${offending.join(", ")}, not opacity or transform.`)];
}

/**
 * Every rule that reads one pass of the page, called once per viewport by the
 * driver. These are the rendered tier's own rules only: a judged rule reaches a
 * model through a connector, and lands with #126 rather than here.
 */
export function renderedFindings(
  records: readonly StyleRecord[],
  tokens: TokenSet,
): readonly Finding[] {
  return records.flatMap((record) => [
    ...colorFindings(record, tokens),
    ...typeScaleFindings(record, tokens),
    ...touchTargetFindings(record),
    ...contrastFindings(record),
    ...motionPropertyFindings(record),
  ]);
}

/**
 * Colours the page painted that no rule could judge, distinct and in the order
 * they were met. A run reports these rather than quietly checking less than it
 * was asked to.
 */
export function unreadableColors(records: readonly StyleRecord[]): readonly string[] {
  const found = new Set<string>();
  for (const record of records) {
    for (const value of [record.color, record.backgroundColor, record.backdrop]) {
      if (isUnreadableColor(value)) found.add(value);
    }
  }
  return [...found];
}

/**
 * Whether anything but a fade still runs. Opacity is the motion the safe list
 * permits, so flagging it here would set the two motion rules against it.
 */
function movesBeyondFade(record: StyleRecord): boolean {
  const moving = isStill(record.transitionDuration) ? [] : transitioned(record);
  const animated = isStill(record.animationDuration) ? [] : record.animationProperties;
  const properties = [...new Set([...moving, ...animated])];
  return properties.length > 0 && properties.some((property) => property !== "opacity");
}

/**
 * The second pass. A page that honours the query computes every duration to
 * zero under it, so anything still moving has hard-coded its motion.
 */
export function reducedMotionFindings(records: readonly StyleRecord[]): readonly Finding[] {
  return records
    .filter((record) => movesBeyondFade(record))
    .map((record) =>
      finding(
        "maple/rendered-reduced-motion",
        record,
        "This still moves under prefers-reduced-motion.",
      ),
    );
}
