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
