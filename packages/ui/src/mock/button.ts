/** The box's buttons: a pill, a quiet one beside a primary one, an optional icon. */

import { createElement } from "react";

import { SearchIcon } from "../icons/search.js";
import { MOCK_COPY } from "./language.js";

import type { IconComponent } from "../icons/icon.js";
import type { MockClient, MockSearch } from "@maple-kit/mock/client";
import type { ReactElement } from "react";

export interface ButtonFlags {
  readonly disabled?: boolean;
  readonly primary?: boolean;
  /** A secondary action: no border, so it reads apart from the one beside it. */
  readonly quiet?: boolean;
  readonly icon?: IconComponent;
  /** Marks a button that opens a search, so Escape can hand focus back to it. */
  readonly search?: string;
  readonly label?: string;
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
      "aria-label": flags.label,
      onClick,
    },
    flags.icon && createElement(flags.icon),
    text,
  );
}

/** The title row's quiet "Search all", which turns the title into a field. */
export function searchAll(kind: MockSearch, client: MockClient): ReactElement {
  const label = kind === "calls" ? MOCK_COPY.apisField : MOCK_COPY.flagsField;
  return button(MOCK_COPY.searchAll, () => client.setSearch(kind), {
    quiet: true,
    icon: SearchIcon,
    search: kind,
    label,
  });
}

/** Cancel, in the title row beside the field. */
export function cancel(client: MockClient): ReactElement {
  return button(MOCK_COPY.cancel, () => client.setSearch(undefined), { quiet: true });
}

/** What was typed into a search field before its chunk loaded. */
let held = "";

function hold(text: string): void {
  held = text;
}

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
export function SearchHold(props: { kind: MockSearch; client: MockClient }): ReactElement {
  const { client, kind } = props;
  const label = kind === "calls" ? MOCK_COPY.apisField : MOCK_COPY.flagsField;
  return createElement(
    "div",
    { className: "mk-mock-titlerow" },
    createElement("input", {
      className: "mk-mock-field",
      placeholder: label,
      "aria-label": label,
      autoFocus: true,
      onChange: (event: { currentTarget: HTMLInputElement }) => hold(event.currentTarget.value),
    }),
    cancel(client),
  );
}
