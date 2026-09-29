/**
 * The anchor cascade: recording where a comment was left, and finding that
 * place again on a page that has since changed.
 *
 * Roughly a quarter of anchors orphan over time. That is the expected case,
 * not a failure, which is why an orphan carries a reason a reviewer can read.
 */

export type {
  AnchorRegion,
  LocatedBy,
  MemberAnchor,
  MemberOffset,
  PickKind,
  RegionMember,
} from "../types.js";
export { describeElement, describeRange } from "./describe.js";
export type { DescribeOptions } from "./describe.js";
export { kindOf } from "./kind.js";
export { labelFor, nameMembers, sourceFor, unpickCamelCase } from "./label.js";
export type { LabelSource } from "./label.js";
export { createSourceLocator, installSourceLocator, locateSource } from "./locate.js";
export type { SourceLocation, SourceLocator, SourceLocatorOptions } from "./locate.js";
export { membersBox } from "./members-resolve.js";
export { captureMembers, MAXIMUM_MEMBERS, MINIMUM_OVERLAP } from "./members.js";
export type { CaptureOptions } from "./members.js";
export { regionBox, regionOf } from "./region.js";
export type { RegionBox } from "./region.js";
export { resolveAnchor } from "./resolve.js";

export type { ResolveOptions } from "./resolve.js";
export { OVERLAY_MARKER } from "./text-position.js";
export { RUNGS } from "./types.js";
export type {
  Anchor,
  Orphaned,
  OrphanReason,
  PlacedMember,
  Resolution,
  Resolved,
  Rung,
  TextQuote,
} from "./types.js";
