import { describe, expect, it } from "vitest";

import { ruleCss, tokenCss } from "../src/stylesheet.js";
import {
  COLOR_TOKENS,
  MOTION_TOKENS,
  RADIUS_TOKENS,
  REDUCED_MOTION_TOKENS,
  RUNTIME_TOKENS,
  SHADOW_TOKENS,
  SIZE_TOKENS,
  TYPE_TOKENS,
} from "../src/tokens.js";

const TOKENS = tokenCss();
const RULES = ruleCss();

/**
 * Every name the sheet declares, whichever block declared it — a part may
 * derive a local alias on its own selector rather than on `:host`.
 */
const declared = new Set(
  [...`${TOKENS}\n${RULES}`.matchAll(/^ *(--mk-[\w-]+):/gm)].map((match) => match[1]!),
);

/** Every name the sheet reads back out of a variable. */
const referenced = new Set(
  [...`${TOKENS}\n${RULES}`.matchAll(/var\((--mk-[\w-]+)/g)].map((match) => match[1]!),
);

describe("the token contract", () => {
  it.each([
    ["colour", COLOR_TOKENS],
    ["shadow", SHADOW_TOKENS],
  ])("declares every %s token in both schemes", (_kind, tokens) => {
    for (const name of Object.keys(tokens)) {
      expect(TOKENS).toContain(`${name}: ${tokens[name]!.light};`);
      expect(TOKENS).toContain(`${name}: ${tokens[name]!.dark};`);
    }
  });

  it.each([
    ["radius", RADIUS_TOKENS],
    ["type", TYPE_TOKENS],
    ["size", SIZE_TOKENS],
    ["motion", MOTION_TOKENS],
  ])("declares every %s token once, unthemed", (_kind, tokens) => {
    for (const [name, value] of Object.entries(tokens)) {
      expect(TOKENS).toContain(`${name}: ${value};`);
    }
  });

  it("declares every token a rule reads", () => {
    const missing = [...referenced].filter(
      (name) => !declared.has(name) && !RUNTIME_TOKENS.includes(name),
    );
    expect(missing).toEqual([]);
  });

  it("never declares a runtime token, which arrives through setProperty", () => {
    for (const name of RUNTIME_TOKENS) expect(declared.has(name)).toBe(false);
  });

  it("keeps the radii concentric, outer = inner + padding", () => {
    const value = (name: string) => Number.parseInt(RADIUS_TOKENS[name]!, 10);
    expect(value("--mk-r") - value("--mk-r-sm")).toBe(3);
    expect(value("--mk-r-sm") - value("--mk-r-xs")).toBe(2);
  });
});

/**
 * The rules may not spell a duration or an easing: a part that writes its own
 * is a part that stops honouring reduced motion the moment someone reduces it.
 */
describe("motion lives only in tokens", () => {
  /** What is left of a rule once every `var(--mk-…)` has been taken out of it. */
  const literals = RULES.split("\n").map((line) => line.replace(/var\(--mk-[\w-]+\)/g, ""));

  it.each([
    ["a duration", /\b\d+m?s\b/],
    ["an easing curve", /cubic-bezier|\bease(-in|-out|-in-out)?\b|\blinear\b|\bsteps\(/],
  ])("has no rule spelling %s", (_what, pattern) => {
    expect(literals.filter((line) => pattern.test(line))).toEqual([]);
  });

  it("never transitions all", () => {
    expect(RULES).not.toMatch(/transition:\s*all/);
  });

  it("gives no close a longer duration than its open", () => {
    const ms = (name: string) => Number.parseInt(MOTION_TOKENS[name]!, 10);
    expect(ms("--mk-dur-island-close")).toBeLessThan(ms("--mk-dur-island-open"));
    expect(ms("--mk-dur-composer-close")).toBeLessThan(ms("--mk-dur-composer-open"));
  });

  it("keeps overshoot on the entrance easing alone", () => {
    const overshoots = Object.entries(MOTION_TOKENS).filter(([, value]) =>
      /cubic-bezier\(\s*[\d.]+,\s*1\.[1-9]/.test(value),
    );
    expect(overshoots.map(([name]) => name)).toEqual(["--mk-ease-entrance"]);
  });

  it("caps the stagger under 300ms, so a long list does not crawl in", () => {
    const step = Number.parseInt(MOTION_TOKENS["--mk-stagger-step"]!, 10);
    const cap = Number.parseInt(MOTION_TOKENS["--mk-stagger-cap"]!, 10);
    expect(cap).toBeLessThan(300);
    expect(cap % step).toBe(0);
  });
});

describe("reduced motion", () => {
  it("holds the loader still rather than spinning it", () => {
    expect(RULES).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.mk-spin \{\s*animation: none;/,
    );
  });

  it("reduces every duration to 100ms or less", () => {
    const durations = Object.entries(REDUCED_MOTION_TOKENS).filter(([name]) =>
      name.startsWith("--mk-dur"),
    );
    expect(durations).toHaveLength(
      Object.keys(MOTION_TOKENS).filter((name) => name.startsWith("--mk-dur")).length,
    );
    for (const [, value] of durations) expect(Number.parseInt(value, 10)).toBeLessThanOrEqual(100);
  });

  /**
   * A keyframe that spells its own distance keeps moving when a reader has
   * asked it not to, because only the tokens are redefined.
   */
  it("reaches every keyframe, none of which spells a distance of its own", () => {
    const frames = [...RULES.matchAll(/@keyframes[^{]+\{[\s\S]*?\n\}/g)].map((match) => match[0]);
    expect(frames.length).toBeGreaterThan(0);

    const literals = frames.map((frame) => frame.replace(/var\(--mk-[\w-]+\)/g, ""));
    expect(literals.filter((frame) => /[\d.]px/.test(frame))).toEqual([]);
  });

  it("collapses distance, pre-scale and stagger, leaving the opacity", () => {
    expect(REDUCED_MOTION_TOKENS["--mk-rise-mark"]).toBe("0px");
    expect(REDUCED_MOTION_TOKENS["--mk-rise-card"]).toBe("0px");
    expect(REDUCED_MOTION_TOKENS["--mk-rise-row"]).toBe("0px");
    expect(REDUCED_MOTION_TOKENS["--mk-icon-blur"]).toBe("0px");
    expect(REDUCED_MOTION_TOKENS["--mk-scale-island"]).toBe("1");
    expect(REDUCED_MOTION_TOKENS["--mk-icon-scale"]).toBe("1");
    expect(REDUCED_MOTION_TOKENS["--mk-stagger-step"]).toBe("0ms");
  });

  it("answers for every motion token, so none keeps its full value", () => {
    const byName = (a: string, b: string) => a.localeCompare(b);
    expect(Object.keys(REDUCED_MOTION_TOKENS).sort(byName)).toEqual(
      Object.keys(MOTION_TOKENS).sort(byName),
    );
  });
});

describe("the overlay brings its own everything", () => {
  it.each([
    ["its own font stack", "font-family: var(--mk-font)"],
    ["antialiasing", "-webkit-font-smoothing: antialiased"],
    ["pretty bodies", ".mk-body {\n  text-wrap: pretty;\n}"],
    ["balanced headings", "text-wrap: balance"],
    ["a 40px hit floor", "var(--mk-hit)"],
  ])("declares %s", (_what, expected) => {
    expect(RULES).toContain(expected);
  });

  it("assumes no host class, because none exists inside the shadow root", () => {
    const classes = [...RULES.matchAll(/\.([a-z][\w-]*)/g)].map((match) => match[1]!);
    expect(classes.filter((name) => !name.startsWith("mk-"))).toEqual([]);
  });
});

/** `oklch(L C H)`, which is the only colour form the token table uses. */
function lightnessOf(value: string): number {
  const found = /^oklch\(([\d.]+)/.exec(value.trim());
  if (!found) throw new Error(`not an oklch colour: ${value}`);
  return Number(found[1]);
}

/**
 * A ring nobody can find is not a ring. At #283618 and #606c38 the light accent
 * read as black on white and the dark one barely cleared the overlay's panel.
 */
describe("what the accent has to clear", () => {
  const GAP = 0.25;

  it.each([
    ["light", "light" as const, "--mk-bg"],
    ["dark", "dark" as const, "--mk-bg"],
  ])("stands off the overlay's own background in %s", (_scheme, scheme, background) => {
    const accent = lightnessOf(COLOR_TOKENS["--mk-accent"]![scheme]);
    const behind = lightnessOf(COLOR_TOKENS[background]![scheme]);

    expect(Math.abs(accent - behind)).toBeGreaterThan(GAP);
  });

  it.each([
    ["light", "light" as const],
    ["dark", "dark" as const],
  ])("keeps its ink on the other side of it in %s", (_scheme, scheme) => {
    const accent = lightnessOf(COLOR_TOKENS["--mk-accent"]![scheme]);
    const ink = lightnessOf(COLOR_TOKENS["--mk-accent-ink"]![scheme]);

    expect(Math.abs(accent - ink)).toBeGreaterThan(GAP * 2);
  });

  /**
   * The warm colour is what Maple noticed, not what went wrong. At hue 29 it
   * read as an error message, which is the one thing it must never say.
   */
  it.each([
    ["light", "light" as const],
    ["dark", "dark" as const],
  ])("keeps the maple colour out of the reds in %s", (_scheme, scheme) => {
    const hue = COLOR_TOKENS["--mk-maple"]![scheme].trim().split(" ").at(-1)?.replace(")", "");

    expect(Number(hue)).toBeGreaterThanOrEqual(45);
    expect(Number(hue)).toBeLessThanOrEqual(90);
  });
});
