/**
 * The marks on the page, the ring that says which one is being answered, and
 * the geometry both are drawn from.
 *
 * Three signals never compete for the same pixel: fill says how far through
 * its life a comment is, the edge says how sure the anchor is, colour says its
 * status. `formFor` in the root entry decides fill; this decides the shape,
 * where it goes, and how it gets out of the way of its neighbours.
 *
 * `leaf.ts` is that mark and `pixel-leaf.ts` is the brand's, which is artwork
 * in 33 fixed colours: it cannot be recoloured by status or clipped at a
 * waterline, so only the lockup draws it.
 */

export { MapleAvatar, MapleAvatar as Avatar, initialsOf } from "./avatar.js";
export type { AvatarProps } from "./avatar.js";
export { LABEL_SPOTS, labelBox, labelSpotFor, pageTextIn } from "./clearance.js";
export type { LabelPlacement, LabelSpot } from "./clearance.js";
export { marksCss } from "./css.js";
export { startFrameLoop, useFrameLoop, viewportHeight } from "./frame.js";
export type { Paint } from "./frame.js";
export {
  COLLISION_GAP_PX,
  COLLISION_MAX_TRIES,
  COLLISION_STEP_PX,
  culled,
  MARK_HIT_PX,
  MARK_OFFSET_PX,
  MARK_SIZE_PX,
  markSpot,
  placeMark,
  ringBox,
  runBox,
  waterline,
} from "./geometry.js";
export type { Box, Waterline } from "./geometry.js";
export { kindPhrase, markLabel, markTitle, NOTHING_NAMED, ringLabel } from "./label.js";
export type { RingLabel } from "./label.js";
export { MapleMarkLayer, MapleMarkLayer as MarkLayer } from "./layer.js";
export type { MarkLayerProps } from "./layer.js";
export { LEAF_OUTLINE, LEAF_ROTATION, LEAF_SOLID, LEAF_VIEW_BOX } from "./leaf.js";
export { MapleMark, MapleMark as Mark } from "./mark.js";
export type { MarkProps } from "./mark.js";
export { clampNudge, dragged, NUDGE_LIMIT_PX, NUDGE_THRESHOLD_PX, useNudges } from "./nudge.js";
export type { Nudge, NudgeHandlers, NudgePointer, Nudges } from "./nudge.js";
export { flag, MOVING_ATTRIBUTE, OFF_ATTRIBUTE, place } from "./paint.js";
export { PIXEL_LEAF_SHADES, PIXEL_LEAF_VIEW_BOX } from "./pixel-leaf.js";
export { addresses, placements } from "./placement.js";
export type { DraftPlacement, Located, Placement } from "./placement.js";
export {
  BELOW_ATTRIBUTE,
  END_ATTRIBUTE,
  MapleTargetRing,
  MapleTargetRing as TargetRing,
} from "./ring.js";
export type { RingState, TargetRingProps } from "./ring.js";
export { HALF, MapleLeaf, MapleLeaf as Leaf, nextClipId } from "./shape.js";
export type { LeafProps } from "./shape.js";
