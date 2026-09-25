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
import { mockCss } from "./mock/css.js";
import { noticeCss } from "./notice/css.js";
import { pickerCss } from "./picker/css.js";
import { baseCss, tokenCss } from "./sheet-base.js";

export { SCHEME_ATTRIBUTE, tokenCss } from "./sheet-base.js";

/** The base and every part's rules. */
export function ruleCss(): string {
  return `
${baseCss()}

${islandCss()}
${composerCss()}
${marksCss()}
${noticeCss()}
${pickerCss()}
${mockCss()}
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
