/** The box's buttons: a pill, a quiet one beside a primary one, an optional icon. */

import { createElement } from "react";

import type { IconComponent } from "../icons/icon.js";
import type { ReactElement } from "react";

export interface ButtonFlags {
  readonly disabled?: boolean;
  readonly primary?: boolean;
  /** A secondary action: no border, so it reads apart from the one beside it. */
  readonly quiet?: boolean;
  readonly icon?: IconComponent;
  /** Marks a button that opens a search, so Escape can hand focus back to it. */
  readonly search?: string;
}

export function button(text: string, onClick: () => void, flags: ButtonFlags = {}): ReactElement {
  return createElement(
    "button",
    {
      type: "button",
      className: "mk-mock-button mk-press",
      disabled: flags.disabled === true,
      "data-mk-primary": flags.primary === true ? "true" : undefined,
      "data-mk-quiet": flags.quiet === true ? "true" : undefined,
      "data-mk-search": flags.search,
      onClick,
    },
    flags.icon && createElement(flags.icon),
    text,
  );
}

/** What was typed into a search field before its chunk loaded. */
let held = "";

/** Hands over, once, what the stand-in field was given. */
export function takeHeld(): string {
  const text = held;
  held = "";
  return text;
}

/**
 * The search field before its chunk has loaded: it takes focus at once and
 * keeps what is typed, so no keystroke lands on the button that was clicked.
 */
export function searchHold(label: string, escape: string): ReactElement {
  return createElement(
    "div",
    { className: "mk-mock-head" },
    createElement("input", {
      className: "mk-mock-field",
      placeholder: label,
      "aria-label": label,
      autoFocus: true,
      onChange: (event: { currentTarget: HTMLInputElement }) => {
        held = event.currentTarget.value;
      },
    }),
    createElement("kbd", { className: "mk-mock-key-hint" }, escape),
  );
}
