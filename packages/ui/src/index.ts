/**
 * Maple's composed parts: the root, the conventions, and the token contract.
 *
 * This entry carries what every part needs and no part itself. The marks, the
 * island and the composer are their own subpaths, because one index naming
 * every part is how tree-shaking quietly stops working across bundler
 * versions. This package depends on `@maple-kit/react` and never re-exports it:
 * an application rendering comments in its own design system depends on that
 * package and pulls in none of this one.
 */

export { MapleUiContextError, useMapleUi } from "./context.js";
export type { MapleUiContextValue } from "./context.js";
export { confidenceFor, dataAttributes, formFor } from "./data.js";
export type {
  PartAttributes,
  PartConfidence,
  PartForm,
  PartProvenance,
  PartState,
} from "./data.js";
export { STATUS_LABELS } from "./language.js";
export { MapleRoot, MapleRoot as Root } from "./root.js";
export type { MapleRootProps, ThemePreference } from "./root.js";
export { AsChildError, composeRefs, mergeProps, Slot } from "./slot.js";
export type { AsChildProps, SlotProps } from "./slot.js";
export {
  applyReviewerSlot,
  REVIEWER_SLOT_COUNT,
  SLOT_INK_PROPERTY,
  SLOT_PROPERTY,
  slotColor,
  slotInk,
} from "./slots.js";
export { OVERLAY_CSS, SCHEME_ATTRIBUTE } from "./stylesheet.js";
export { useOverlayScheme } from "./theme.js";
export type { OverlayTheme } from "./theme.js";
export { Tip, tipSpot } from "./tip.js";
export type { TipProps } from "./tip.js";
export {
  MOTION_TOKENS,
  RADIUS_TOKENS,
  REDUCED_MOTION_TOKENS,
  RUNTIME_TOKENS,
  SHEET_BREAKPOINT_PX,
} from "./tokens.js";
