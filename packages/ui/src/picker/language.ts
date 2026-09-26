/**
 * What the picker says while it is armed.
 *
 * One line, in the imperative, naming the gesture rather than the mode: a
 * reviewer who armed the wrong one reads what to do, sees the other two
 * beside it, and switches without going back to the island for it.
 */

import type { PickKind } from "@maple-kit/core/client";

/** The instruction for each pick, which is the gesture and nothing else. */
export const PICK_HINTS: Readonly<Record<PickKind, string>> = {
  element: "Click anything on the page",
  region: "Drag a box around the area",
  text: "Select the passage",
};

/** The picker's own words. */
export const PICKER_COPY = {
  cancel: "Cancel",
  cancelHint: "Esc",
  bar: "Choosing what to comment on",
  cycle: "Press c again to cycle",
} as const;

/** What a screen reader hears on the bar while a pick is armed. */
export function pickerLabel(kind: PickKind): string {
  return `${PICKER_COPY.bar}: ${PICK_HINTS[kind]}.`;
}
