/**
 * The in-page overlay entrypoint.
 *
 * Two constraints are fixed and load-bearing under a strict CSP: the overlay
 * ships as a bundled component so it inherits the host's nonce, and all styling
 * goes through adopted stylesheets. docs/overlay-csp.md says why.
 */

/** How the overlay is configured when it mounts. */
export interface OverlayOptions {
  /** Branch or pull-request the comments belong to. */
  readonly branch: string;
  /** Path the SDK route is mounted at. Defaults to `/api/maple`. */
  readonly basePath?: string;
  /** CSP nonce, when the host passes one explicitly. */
  readonly nonce?: string;
}

/** Path the SDK route is mounted at unless configured otherwise. */
export const DEFAULT_BASE_PATH = "/api/maple";

/** Builds an adoptable stylesheet, the only styling path the overlay may use. */
export function createOverlayStyleSheet(css: string): CSSStyleSheet {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  return sheet;
}
