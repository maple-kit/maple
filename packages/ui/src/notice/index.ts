/**
 * The notice: what the overlay says when a request did not work.
 *
 * Its own subpath because both the island and the composer draw one, and
 * because an application composing its own surface needs the failure said
 * somewhere even when it replaces every other part.
 */

export { noticeCss } from "./css.js";
export { isSetupGap, NOTICE_COPY, offersSignIn } from "./language.js";
export { MapleNotice, MapleNotice as Notice } from "./notice.js";
export type { MapleNoticeProps } from "./notice.js";
