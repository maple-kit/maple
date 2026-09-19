/**
 * The island. One object on a page at rest, and this is it.
 *
 * A collapsed pill reading `8 open`, which expands into a card carrying both
 * halves of the job: what has been said here, and how to say something. The
 * count is open comments only, unpinned included, because whether a comment is
 * dealt with is the question and where it sits is a detail of one of its states.
 */

export { countsFor, kindOf, numbersFor, orphanReason, resolutionsFor } from "./comments.js";
export type { FilterCounts } from "./comments.js";
export { IslandContent } from "./content.js";
export type { IslandContentProps } from "./content.js";
export { IslandContextError, reasonOf, useIsland } from "./context.js";
export type { DragHandlers, IslandContextValue, IslandPhase, PointerEventLike } from "./context.js";
export { islandCss } from "./css.js";
export { DRAG_THRESHOLD_PX, DRAGGING_ATTRIBUTE, useDrag } from "./drag.js";
export { Filters } from "./filters.js";
export type { FiltersProps } from "./filters.js";
export { Branch, Header, Logo } from "./header.js";
export type { BranchProps, HeaderProps, LogoProps } from "./header.js";
export { Island } from "./island.js";
export type { IslandProps } from "./island.js";
export { Item, TIME_DELAY_MS } from "./item.js";
export type { ItemProps } from "./item.js";
export {
  FILTER_LABELS,
  ISLAND_COPY,
  kindPhrase,
  openLabel,
  ORPHAN_LABELS,
  ORPHAN_SENTENCES,
  orphanTitle,
  PATH_COPY,
  RUNG_LABELS,
  rungLabel,
  rungTitle,
  SETTINGS_COPY,
} from "./language.js";
export { List } from "./list.js";
export type { ListProps } from "./list.js";
export { NewComment, PickButton } from "./new-comment.js";
export type { NewCommentProps, PickButtonProps } from "./new-comment.js";
export { Settings } from "./settings.js";
export type { SettingsProps } from "./settings.js";
export { STAGGER_ROWS } from "./stagger.js";
export { absoluteTime, relativeTime } from "./time.js";
export { IslandTrigger } from "./trigger.js";
export type { IslandTriggerProps } from "./trigger.js";
