/**
 * `Maple.Body`: the one field, and a placeholder that asks for a problem.
 *
 * Every keystroke reaches the controller, which debounces it into the draft
 * store, so an unsent comment survives a reload without this part knowing
 * storage exists. The emoji control is the field's, not the footer's: it
 * writes at the caret, and only the field knows where that is.
 */

import { useMaple, useMapleClient } from "@maple-kit/react";
import { createElement, forwardRef, useEffect, useRef, useState } from "react";

import { composeRefs, Slot } from "../slot.js";
import { usePublish } from "./actions.js";
import { searchEmoji, shortcodeAt, writeAt } from "./emoji.js";
import { EmojiGrid, MapleEmoji } from "./picker-emoji.js";

import type { AsChildProps } from "../slot.js";
import type { Shortcode } from "./emoji.js";
import type { ChangeEvent, KeyboardEvent, ReactNode } from "react";

/** The field. `asChild` hands it to an application's own textarea. */
export interface MapleBodyProps extends AsChildProps {
  readonly className?: string;
  /** The control in the field's corner. On unless an application draws its own. */
  readonly emoji?: boolean;
}

/** It asks for a problem rather than for a comment. */
export const COMPOSER_PLACEHOLDER = "What is wrong with this?";

/** The comment itself. Focused on open; never cleared by a close. */
export const MapleBody = /** @__PURE__ */ forwardRef<HTMLTextAreaElement, MapleBodyProps>(
  function MapleBody(props, ref) {
    const { composer, publishing } = useMaple();
    const client = useMapleClient();
    const publish = usePublish();
    const field = useRef<HTMLTextAreaElement>(null);
    const [open, setOpen] = useState(false);
    const suggest = useSuggestions(composer.body);
    const reading = composer.viewing !== undefined;

    // `Slot` renders the caller's element, so the part's own props are typed
    // against the element it would otherwise have rendered.
    const Element = (props.asChild ? Slot : "textarea") as "textarea";

    useEffect(() => {
      if (composer.open && !reading) field.current?.focus();
    }, [composer.open, reading]);

    if (reading) {
      return createElement(
        "p",
        {
          className: ["mk-composer-row", "mk-read", "mk-body", props.className]
            .filter(Boolean)
            .join(" "),
        },
        composer.body,
      );
    }

    const write = (glyph: string, over?: Shortcode): void => {
      const caret = field.current?.selectionStart ?? composer.body.length;
      const from = over?.start ?? caret;
      const next = writeAt(composer.body, from, caret, glyph);

      client.setBody(next.body);
      suggest.clear();
      setOpen(false);
      restore(field, next.caret);
    };

    const area = createElement(Element, {
      ref: composeRefs<HTMLTextAreaElement>(ref, field),
      className: ["mk-field", "mk-body", props.className].filter(Boolean).join(" "),
      value: composer.body,
      placeholder: COMPOSER_PLACEHOLDER,
      "aria-label": COMPOSER_PLACEHOLDER,
      onChange: (event: ChangeEvent<HTMLTextAreaElement>) => {
        client.setBody(event.target.value);
        suggest.read(event.target.value, event.target.selectionStart);
      },
      onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (!isSend(event)) return suggest.onKeyDown(event, write);
        event.preventDefault();
        if (composer.body.trim() !== "" && !publishing) publish();
      },
      onBlur: () => suggest.clear(),
    });

    return createElement(
      "div",
      { className: "mk-composer-row mk-field-wrap" },
      area,
      props.emoji === false
        ? null
        : createElement(MapleEmoji, {
            open,
            onToggle: setOpen,
            onPick: (glyph: string) => write(glyph),
          }),
      menu(suggest, write),
    );
  },
);

/** The `:` menu, which is the emoji grid over the field's bottom edge. */
function menu(suggest: Suggestions, write: (glyph: string, over?: Shortcode) => void): ReactNode {
  if (!suggest.at || suggest.found.length === 0) return null;

  return createElement(EmojiGrid, {
    className: "mk-emoji-menu",
    emoji: suggest.found,
    active: suggest.active,
    onPick: (glyph: string) => write(glyph, suggest.at),
  });
}

interface Suggestions {
  readonly at: Shortcode | undefined;
  readonly found: ReturnType<typeof searchEmoji>;
  readonly active: number;
  readonly read: (body: string, caret: number | null) => void;
  readonly clear: () => void;
  readonly onKeyDown: (
    event: KeyboardEvent<HTMLTextAreaElement>,
    write: (glyph: string, over?: Shortcode) => void,
  ) => void;
}

/** What `:` is offering, and the three keys that drive it. */
function useSuggestions(body: string): Suggestions {
  const [caret, setCaret] = useState<number>();
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);

  // Derived rather than stored: a body replaced from elsewhere — a resumed
  // draft, a discard — is not a shortcode being typed, and deriving it means
  // the menu goes with the words instead of outliving them.
  const at = dismissed || caret === undefined ? undefined : shortcodeAt(body, caret);
  const found = at ? searchEmoji(at.query) : [];

  const clear = (): void => {
    setDismissed(true);
    setActive(0);
  };

  const read = (next: string, where: number | null): void => {
    setCaret(where ?? undefined);
    setDismissed(false);
    setActive(0);
  };

  const onKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>,
    write: (glyph: string, over?: Shortcode) => void,
  ): void => {
    if (!at || found.length === 0) return;
    // The composer closes on Escape too, and a menu open over it is the
    // newer surface: it takes the key rather than sharing it.
    if (event.key === "Escape") {
      event.stopPropagation();
      return clear();
    }

    const step = stepFor(event.key);
    if (step !== 0) {
      event.preventDefault();
      return setActive((was) => (was + step + found.length) % found.length);
    }
    if (event.key !== "Enter" && event.key !== "Tab") return;

    event.preventDefault();
    const glyph = found[active]?.glyph;
    if (glyph) write(glyph, at);
  };

  return { at, found, active, read, clear, onKeyDown };
}

/**
 * ⌘/Ctrl+Enter publishes, as it does in every chat field a reviewer knows.
 * Enter and Shift+Enter still start a new line: a comment can be a list.
 */
function isSend(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
): boolean {
  if (event.key !== "Enter" || event.shiftKey || event.altKey) return false;
  return event.metaKey || event.ctrlKey;
}

/** Which way a key moves through the menu, or nowhere at all. */
function stepFor(key: string): number {
  if (key === "ArrowDown" || key === "ArrowRight") return 1;
  return key === "ArrowUp" || key === "ArrowLeft" ? -1 : 0;
}

/** Puts the caret back after React has written the new value. */
function restore(field: React.RefObject<HTMLTextAreaElement | null>, caret: number): void {
  requestAnimationFrame(() => {
    const node = field.current;
    if (!node) return;
    node.focus();
    node.setSelectionRange(caret, caret);
  });
}
