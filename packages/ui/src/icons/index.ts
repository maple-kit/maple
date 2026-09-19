/**
 * The nine icons, one module each.
 *
 * This entry names them rather than collecting them: every export below is a
 * distinct module, so importing one drags in one. There is deliberately no
 * `ICONS` record — a record is retained whole the moment anything indexes it
 * dynamically, and the bundle budget does not survive that.
 */

export { BranchIcon } from "./branch.js";
export { CogIcon } from "./cog.js";
export { CommitIcon } from "./commit.js";
export { IconCrossfade } from "./crossfade.js";
export type { IconCrossfadeProps } from "./crossfade.js";
export { ElementIcon } from "./element.js";
export { createIcon, ICON_SIZE } from "./icon.js";
export type { IconComponent, IconProps, IconSpec } from "./icon.js";
export { NoPlaceIcon } from "./noplace.js";
export { RegionIcon } from "./region.js";
export { SparkleIcon } from "./sparkle.js";
export { TargetIcon } from "./target.js";
export { TextIcon } from "./text.js";
