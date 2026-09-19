/**
 * The emoji control, drawn in the field's bottom corner.
 *
 * It is inside the field rather than beside the send button because that is
 * where it is reached from: the hand is already in the text. The grid it
 * opens and the menu a `:` shortcode opens are the same list, drawn once.
 */

import { createElement, forwardRef } from "react";

import { Slot } from "../slot.js";
import { REVIEW_EMOJI } from "./emoji.js";

import type { AsChildProps } from "../slot.js";
import type { EmojiChoice } from "./emoji.js";
import type { ReactElement } from "react";

/** The control. Takes `asChild` and nothing that changes its look. */
export interface MapleEmojiProps extends AsChildProps {
  readonly className?: string;
  readonly open?: boolean;
  readonly onToggle?: (open: boolean) => void;
  /** Called with the glyph. The caller owns the caret, so it does the writing. */
  readonly onPick?: (glyph: string) => void;
  /** Replaces the default set, in the order they are shown. */
  readonly emoji?: readonly EmojiChoice[];
}

/** Every word this part shows. */
export const EMOJI_COPY = {
  open: "Add an emoji",
  close: "Close the emoji list",
  hint: "Type : to search them",
} as const;

/** The button, and the grid it opens above itself. */
export const MapleEmoji = /** @__PURE__ */ forwardRef<HTMLButtonElement, MapleEmojiProps>(
  function MapleEmoji(props, ref) {
    const open = props.open ?? false;
    const Element = (props.asChild ? Slot : "button") as "button";

    const button = createElement(
      Element,
      {
        ref,
        type: "button",
        className: ["mk-emoji-open", props.className].filter(Boolean).join(" "),
        "aria-expanded": open,
        "aria-label": open ? EMOJI_COPY.close : EMOJI_COPY.open,
        title: `${EMOJI_COPY.open} — ${EMOJI_COPY.hint}`,
        onClick: () => props.onToggle?.(!open),
      },
      "☺",
    );

    const grid = createElement(EmojiGrid, {
      emoji: props.emoji ?? REVIEW_EMOJI,
      onPick: (glyph: string) => props.onPick?.(glyph),
    });

    return createElement("span", { className: "mk-emoji" }, button, open ? grid : null);
  },
);

/** What both surfaces draw: a row of glyphs, each its own button. */
export interface EmojiGridProps {
  readonly emoji: readonly EmojiChoice[];
  readonly onPick: (glyph: string) => void;
  readonly active?: number;
  readonly className?: string;
}

/** The grid. Labelled by shortcode, so a screen reader hears a word. */
export function EmojiGrid(props: EmojiGridProps): ReactElement {
  return createElement(
    "span",
    {
      className: ["mk-emoji-grid", props.className].filter(Boolean).join(" "),
      role: "listbox",
      "aria-label": EMOJI_COPY.open,
    },
    ...props.emoji.map((one, index) =>
      createElement(
        "button",
        {
          key: one.glyph,
          type: "button",
          role: "option",
          "aria-selected": index === props.active,
          "aria-label": one.names[0] ?? one.glyph,
          title: `:${one.names[0] ?? ""}`,
          className: "mk-emoji-one",
          // A pointer down inside the field would take the caret with it.
          onMouseDown: (event: { preventDefault: () => void }) => event.preventDefault(),
          onClick: () => props.onPick(one.glyph),
        },
        one.glyph,
      ),
    ),
  );
}
