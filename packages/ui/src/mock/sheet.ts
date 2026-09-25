/**
 * The sheet `MapleMock` adopts when it mounts on its own: the tokens, the base
 * rules and the box's rules, and none of the island's, composer's or marks'.
 */

import { baseCss, tokenCss } from "../sheet-base.js";
import { mockCss } from "./css.js";

function buildMockCss(): string {
  return `${tokenCss()}\n\n${baseCss()}\n\n${mockCss()}\n`;
}

/** The box's own styles, for a page with no `<Maple />`. */
export const MOCK_CSS = /** @__PURE__ */ buildMockCss();
