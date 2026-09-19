/**
 * The picker: what turns an armed pick into an open composer.
 *
 * `PickButton` arms; the controller records that a pick is armed; this runs
 * the gesture and closes it. It is its own subpath because an application
 * rendering comments in its own design system still wants this one — the
 * three pickers are the part of the reviewer interface that is not a look.
 */

export { pickerCss } from "./css.js";
export { PICK_HINTS, PICKER_COPY, pickerLabel } from "./language.js";
export { MaplePicker, MaplePicker as Picker, onOwnControl } from "./picker.js";
export type { MaplePickerProps } from "./picker.js";
export { startSession } from "./session.js";
export type { SessionHandlers } from "./session.js";
export { elementOf, targetFor } from "./target.js";
export type { TargetOptions } from "./target.js";
