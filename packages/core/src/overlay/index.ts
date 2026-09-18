/**
 * The in-page overlay.
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

export { captureContext, formatContext } from "./context.js";
export type { CaptureOptions, PageContext, RegionContext, ViewportContext } from "./context.js";
export { createDraftStore } from "./drafts.js";
export type { Draft, DraftStore, DraftStoreOptions } from "./drafts.js";

export { createOverlayHost, createOverlayStyleSheet } from "./host.js";
export type { OverlayHost, OverlayHostOptions } from "./host.js";
export {
  elementAt,
  MINIMUM_REGION,
  selectedText,
  startElementPicking,
  startRegionPicking,
} from "./pick.js";
export type { ElementPickingOptions, Pick, Rect, RegionPickingOptions } from "./pick.js";
