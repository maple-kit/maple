/**
 * What the browser is asked for: the only code in this package that runs
 * inside the page.
 *
 * It describes an element with the same cascade a comment is written through,
 * so a finding and a comment mean the same thing by "where". It collects and
 * does not judge: every rule runs in Node over these records, where it is a
 * pure function with a test.
 */

import { describeElement } from "@maple-kit/core/anchor";
import { captureContext } from "@maple-kit/core/overlay";

import type { Anchor } from "@maple-kit/core/anchor";
import type { Rule, RuleTarget } from "@maple-kit/core/connectors";
import type { PageContext } from "@maple-kit/core/overlay";

/** One element's rendered state, as a rule needs to see it. */
export interface StyleRecord {
  /** Every rung the page could supply, from the cascade itself. */
  readonly anchor: Anchor;
  readonly tag: string;
  /** Trimmed text, capped, for a message that can quote what it is about. */
  readonly text: string;
  /**
   * Whether it paints text itself rather than only through a child, so an
   * ancestor is not judged on a colour it never puts on screen.
   */
  readonly paintsText: boolean;
  /** Whether a pointer is meant to hit it, which is what a touch target is. */
  readonly interactive: boolean;
  readonly color: string;
  /** The element's own background, which is the value a token rule judges. */
  readonly backgroundColor: string;
  /** The first opaque background at or above it, which is what contrast sees. */
  readonly backdrop: string;
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly width: number;
  readonly height: number;
  readonly transitionProperty: string;
  readonly transitionDuration: string;
  readonly animationName: string;
  readonly animationDuration: string;
  /** Properties the running animation's keyframes declare, when readable. */
  readonly animationProperties: readonly string[];
}

/** How much of a page is sent to the judge. Every field is optional. */
export interface TargetLimits {
  /** Most elements one rule sends. Default `MAX_TARGETS_PER_RULE`. */
  readonly maxPerRule?: number;
  /** Most elements one page sends across every rule. Default `MAX_TARGETS`. */
  readonly maxTargets?: number;
  /** Longest subtree HTML for one element, in characters. Default `MAX_TARGET_HTML`. */
  readonly maxHtml?: number;
}

/** Sized for a judge with about 32k tokens of state: 40 x 2000 characters is ~20k. */
export const MAX_TARGETS_PER_RULE = 10;
/** Most elements one page sends to the judge across every rule. */
export const MAX_TARGETS = 40;
/** Longest subtree HTML sent for one element, in characters. */
export const MAX_TARGET_HTML = 2000;
/** Appended where a subtree was cut, so the judge knows it is not seeing all of it. */
export const TRUNCATED = "<!-- truncated -->";
/** Elements that carry no design a judge should read, and a good deal of noise. */
const NOISE = "script, style, noscript, template";

/** The elements the rules chose on one page, and what could not be sent. */
export interface Targets {
  readonly targets: readonly RuleTarget[];
  /** Ids of rules whose `appliesTo` is not a valid selector. */
  readonly invalid: readonly string[];
  /** Matches left out by the per-rule or page-wide cap. */
  readonly dropped: number;
}

/** What a pass is asked to read for the judge. */
export interface JudgedRead extends TargetLimits {
  readonly rules: readonly Rule[];
}

/** One pass over the page: what was on it, and what it was being shown in. */
export interface Reading {
  readonly context: PageContext;
  readonly records: readonly StyleRecord[];
  /** Empty unless the pass was given rules. */
  readonly judged: Targets;
}

const INTERACTIVE_TAGS = ["a", "button", "input", "select", "summary", "textarea"];
const INTERACTIVE_ROLES = ["button", "checkbox", "link", "menuitem", "switch", "tab"];
const TEXT_CAP = 80;

function isInteractive(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  if (INTERACTIVE_TAGS.includes(tag)) return true;
  const role = element.getAttribute("role");
  if (role !== null && INTERACTIVE_ROLES.includes(role)) return true;
  const tabIndex = element.getAttribute("tabindex");
  return tabIndex !== null && Number.parseInt(tabIndex, 10) >= 0;
}

/** Whether a background paints at all, which decides if contrast can stop here. */
function isOpaque(color: string): boolean {
  if (color === "transparent") return false;
  const alpha = /rgba?\([^)]*[,/]\s*([\d.]+)\s*\)/.exec(color);
  return alpha === null || Number.parseFloat(alpha[1]!) > 0;
}

/** The first background the eye actually sees behind the element. */
function backdropOf(element: Element): string {
  let node: Element | null = element;
  while (node !== null) {
    const background = getComputedStyle(node).backgroundColor;
    if (isOpaque(background)) return background;
    node = node.parentElement;
  }
  return "rgb(255, 255, 255)";
}

/** Properties a running animation's keyframes declare, where they are readable. */
function keyframeProperties(names: string): string[] {
  const wanted = names.split(",").map((name) => name.trim());
  if (wanted.every((name) => name === "none" || name === "")) return [];
  const found = new Set<string>();
  for (const sheet of [...document.styleSheets]) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    collectKeyframes(rules, wanted, found);
  }
  return [...found];
}

function collectKeyframes(rules: CSSRuleList, wanted: string[], found: Set<string>): void {
  for (const rule of [...rules]) {
    if (!(rule instanceof CSSKeyframesRule) || !wanted.includes(rule.name)) continue;
    for (const frame of [...rule.cssRules]) {
      if (!(frame instanceof CSSKeyframeRule)) continue;
      for (const property of [...frame.style]) found.add(property);
    }
  }
}

/**
 * Whether a direct child node is text with ink in it: `textContent` includes
 * every descendant, and a wrapper paints none of what its children paint.
 */
function paintsOwnText(element: Element): boolean {
  return [...element.childNodes].some(
    (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "",
  );
}

function recordOf(element: Element): StyleRecord {
  const style = getComputedStyle(element);
  const box = element.getBoundingClientRect();
  return {
    anchor: describeElement(element),
    tag: element.tagName.toLowerCase(),
    text: (element.textContent ?? "").trim().slice(0, TEXT_CAP),
    paintsText: paintsOwnText(element),
    interactive: isInteractive(element),
    color: style.color,
    backgroundColor: style.backgroundColor,
    backdrop: backdropOf(element),
    fontSize: Number.parseFloat(style.fontSize),
    fontWeight: Number.parseFloat(style.fontWeight),
    width: box.width,
    height: box.height,
    transitionProperty: style.transitionProperty,
    transitionDuration: style.transitionDuration,
    animationName: style.animationName,
    animationDuration: style.animationDuration,
    animationProperties: keyframeProperties(style.animationName),
  };
}

/** An element's subtree as HTML, without scripts or styles, capped in size. */
function subtreeHtml(element: Element, cap: number): string {
  const copy = element.cloneNode(true) as Element;
  for (const noise of [...copy.querySelectorAll(NOISE)]) noise.remove();
  const html = copy.outerHTML;
  return html.length > cap ? html.slice(0, cap) + TRUNCATED : html;
}

function matches(selector: string): Element[] | undefined {
  try {
    return [...document.querySelectorAll(selector)];
  } catch {
    return undefined;
  }
}

/**
 * The elements each rule applies to, in rule order, capped per rule and in
 * all. Rules run first to last, so the ones a host lists first are kept when
 * the page-wide cap is reached.
 */
export function readTargets(read: JudgedRead): Targets {
  const perRule = read.maxPerRule ?? MAX_TARGETS_PER_RULE;
  const total = read.maxTargets ?? MAX_TARGETS;
  const cap = read.maxHtml ?? MAX_TARGET_HTML;
  const targets: RuleTarget[] = [];
  const invalid: string[] = [];
  let dropped = 0;
  for (const rule of read.rules) {
    const found = matches(rule.appliesTo);
    if (found === undefined) {
      invalid.push(rule.id);
      continue;
    }
    const room = Math.max(0, Math.min(perRule, total - targets.length));
    for (const element of found.slice(0, room)) {
      targets.push({
        rule: rule.id,
        html: subtreeHtml(element, cap),
        anchor: describeElement(element),
      });
    }
    dropped += Math.max(0, found.length - room);
  }
  return { targets, invalid, dropped };
}

/**
 * Reads every tagged element, and the page they are on. Returns plain data:
 * only what survives structured cloning comes back out of the browser, and a
 * rule should not hold a live node it might read a second, different value from.
 */
export function readPage(judged: JudgedRead = { rules: [] }): Reading {
  const elements = [...document.querySelectorAll("[data-maple-src]")];
  return {
    context: captureContext(),
    records: elements.map(recordOf),
    judged: readTargets(judged),
  };
}
