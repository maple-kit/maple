/**
 * The composer. A panel, and the same panel as a sheet on a narrow screen.
 *
 * There is no `variant="sheet"`: one component and a media query at
 * `SHEET_BREAKPOINT_PX`, which the adopted stylesheet carries as
 * `--mk-composer-w` and `--mk-composer-r`. Each part takes `asChild`, and an
 * `asChild` part renders the caller's element in place of its own — the
 * caller's children, not the part's. The short names are for
 * `import * as Maple`; the long ones are for a named import that has to read.
 */

export { SHEET_BREAKPOINT_PX } from "../tokens.js";
export { CANCEL_LABEL, MapleActions, MapleActions as Actions, SEND_LABEL } from "./actions.js";
export type { MapleActionsProps } from "./actions.js";
export { ATTACH_WORDS, MapleAttachments, MapleAttachments as Attachments } from "./attachments.js";
export type { MapleAttachmentsProps } from "./attachments.js";
export { MapleContextBadge, MapleContextBadge as Context } from "./badge.js";
export type { MapleContextProps } from "./badge.js";
export { COMPOSER_PLACEHOLDER, MapleBody, MapleBody as Body } from "./body.js";
export type { MapleBodyProps } from "./body.js";
export {
  COMPOSER_LABEL,
  DETENT_LABELS,
  MapleComposer,
  MapleComposer as Composer,
} from "./composer.js";
export type { MapleComposerProps } from "./composer.js";
export {
  appended,
  REVIEW_EMOJI,
  searchEmoji,
  shortcodeAt,
  SHORTCODE_LIMIT,
  writeAt,
} from "./emoji.js";
export type { EmojiChoice, Shortcode, Written } from "./emoji.js";
export { createLeaveAsk } from "./leave.js";
export type { LeaveAsk } from "./leave.js";
export { peeks } from "./peek.js";
export {
  KIND_WORDS,
  LEAVE_DISCARD,
  LEAVE_KEEP,
  leaveMessage,
  QUOTE_LIMIT,
  quotedText,
  TARGET_PREFIX,
  targetName,
  targetPhrase,
  UNNAMED_TARGET,
} from "./phrase.js";
export { EMOJI_COPY, EmojiGrid, MapleEmoji, MapleEmoji as Emoji } from "./picker-emoji.js";
export type { EmojiGridProps, MapleEmojiProps } from "./picker-emoji.js";
export { ComposerScopeError } from "./scope.js";
export type { SheetDetent } from "./scope.js";
export { CLOSE_LABEL, DETAIL_ATTRIBUTE, MapleTarget, MapleTarget as Target } from "./target.js";
export type { MapleTargetProps } from "./target.js";
