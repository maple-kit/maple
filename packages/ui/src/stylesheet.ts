/**
 * The overlay's stylesheet: one string, built from the token table.
 *
 * It is a constant rather than a CSS file behind a loader, so it needs no
 * bundler plugin, stays tree-shakeable, and leaves the CSP claim in
 * docs/overlay-csp.md checkable by reading `buildOverlayCss` and
 * `createOverlayStyleSheet`. Nothing here constructs a `CSSStyleSheet`, reaches
 * `document` or reads storage; building a string does none of those.
 */

import { composerCss } from "./composer/css.js";
import { islandCss } from "./island/css.js";
import { marksCss } from "./marks/css.js";
import { pickerCss } from "./picker/css.js";
import {
  COLOR_TOKENS,
  MOTION_TOKENS,
  RADIUS_TOKENS,
  REDUCED_MOTION_TOKENS,
  SHADOW_TOKENS,
  SHEET_BREAKPOINT_PX,
  SIZE_TOKENS,
  TYPE_TOKENS,
} from "./tokens.js";

import type { ThemedToken } from "./tokens.js";

/** The attribute the root writes the overlay's resolved scheme to. */
export const SCHEME_ATTRIBUTE = "data-mk-scheme";

/** Light is the unqualified `:host`, so an unresolved scheme still renders. */
const DARK_HOST = `:host([${SCHEME_ATTRIBUTE}="dark"])`;

function declare(tokens: Readonly<Record<string, string>>): string {
  return Object.entries(tokens)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join("\n");
}

function declareThemed(tokens: Readonly<Record<string, ThemedToken>>, scheme: keyof ThemedToken) {
  return Object.entries(tokens)
    .map(([name, value]) => `  ${name}: ${value[scheme]};`)
    .join("\n");
}

/** Every token, in both schemes, and nothing that is not a token. */
export function tokenCss(): string {
  return [
    `:host {`,
    declareThemed(COLOR_TOKENS, "light"),
    declareThemed(SHADOW_TOKENS, "light"),
    declare(RADIUS_TOKENS),
    declare(TYPE_TOKENS),
    declare(SIZE_TOKENS),
    declare(MOTION_TOKENS),
    `  color-scheme: light;`,
    `}`,
    ``,
    `${DARK_HOST} {`,
    declareThemed(COLOR_TOKENS, "dark"),
    declareThemed(SHADOW_TOKENS, "dark"),
    `  color-scheme: dark;`,
    `}`,
    ``,
    `@media (prefers-reduced-motion: reduce) {`,
    `  :host {`,
    declare(REDUCED_MOTION_TOKENS)
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n"),
    `  }`,
    `}`,
  ].join("\n");
}

/**
 * The base every part builds on. It names its transitioned properties, never
 * `all`, and it references motion only through the tokens above — a part that
 * writes its own duration is a part that stops honouring reduced motion.
 */
export function ruleCss(): string {
  return `
:host {
  display: block;
  font-family: var(--mk-font);
  font-size: 13px;
  font-weight: 400;
  font-style: normal;
  font-variant: normal;
  letter-spacing: normal;
  line-height: 1.45;
  text-align: left;
  color: var(--mk-fg);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

.mk-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.mk-live {
  pointer-events: auto;
}

.mk-surface {
  background: var(--mk-bg);
  border: 1px solid var(--mk-line-firm);
  border-radius: var(--mk-r);
  box-shadow: var(--mk-sh2);
}

${DARK_HOST} .mk-surface {
  box-shadow: var(--mk-sh2), inset 0 1px 0 oklch(1 0 0 / 0.045);
}

.mk-num {
  font-variant-numeric: tabular-nums;
}

.mk-mono {
  font-family: var(--mk-mono);
  font-variant-numeric: tabular-nums;
}

.mk-body {
  text-wrap: pretty;
}

.mk-title,
h1,
h2,
h3 {
  text-wrap: balance;
}

.mk-shot {
  outline: 1px solid var(--mk-shot-edge);
  outline-offset: -1px;
}

:where(a, button, input, textarea, [role="button"], [tabindex]):focus-visible {
  outline: 2px solid var(--mk-accent);
  outline-offset: 2px;
  border-radius: var(--mk-r-xs);
}

.mk-press {
  transition: transform var(--mk-dur-fade) var(--mk-ease-surface);
}

.mk-press:active {
  transform: scale(var(--mk-press));
}

.mk-hit {
  position: relative;
}

.mk-hit::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: max(100%, var(--mk-hit));
  height: max(100%, var(--mk-hit));
  transform: translate(-50%, -50%);
}

.mk-track {
  transition: opacity var(--mk-dur-fade) var(--mk-ease-surface);
}

.mk-icon-swap {
  display: inline-grid;
  place-items: center;
}

.mk-icon-swap > * {
  grid-area: 1 / 1;
  transition:
    opacity var(--mk-dur-swap) var(--mk-ease-swap),
    transform var(--mk-dur-swap) var(--mk-ease-swap),
    filter var(--mk-dur-swap) var(--mk-ease-swap);
}

.mk-icon-swap > [data-mk-icon="out"] {
  opacity: 0;
  transform: scale(var(--mk-icon-scale));
  filter: blur(var(--mk-icon-blur));
}

.mk-icon-swap > [data-mk-icon="in"] {
  opacity: 1;
  transform: scale(1);
  filter: blur(0);
}

@media (max-width: ${SHEET_BREAKPOINT_PX - 1}px) {
  :host {
    --mk-composer-w: 100%;
    --mk-composer-r: var(--mk-r) var(--mk-r) 0 0;
  }
}

${islandCss()}
${composerCss()}
${marksCss()}
${pickerCss()}
`.trim();
}

/**
 * The whole sheet. Pure, so a bundle that imports nothing from this module
 * drops the string rather than shipping it.
 */
function buildOverlayCss(): string {
  return `${tokenCss()}\n\n${ruleCss()}\n`;
}

/** The overlay's styles. The only thing `Maple.Root` adopts. */
export const OVERLAY_CSS = /** @__PURE__ */ buildOverlayCss();
