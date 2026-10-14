/**
 * A button that names one choice and opens the rest: the mock box's pick for
 * a call's state. A `popover="auto"` in the top layer, since the box's body
 * scrolls and would clip anything positioned inside it.
 */

import { createElement, Fragment, useRef } from "react";

import { ChevronIcon } from "../icons/chevron.js";

import type { KeyboardEvent, ReactElement } from "react";

/** One choice. `real` marks what the page does on its own, drawn with a dot. */
export interface MenuOption {
  readonly value: string | undefined;
  readonly label: string;
  readonly real?: boolean;
}

interface MenuProps {
  readonly label: string;
  readonly options: readonly MenuOption[];
  readonly value: string | undefined;
  readonly onPick: (value: string | undefined) => void;
}

/** Kept clear of the viewport's edges by this much. */
const EDGE_PX = 8;

export function Menu(props: MenuProps): ReactElement {
  const { label, onPick, options, value } = props;
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const chosen = options.find((option) => option.value === value) ?? options[0];

  const toggle = () => {
    const node = menu.current;
    const from = trigger.current;
    if (!node || !from) return;
    node.togglePopover();
    if (!node.matches(":popover-open")) return;
    place(node, from.getBoundingClientRect());
    node.querySelector<HTMLElement>("[aria-checked=true]")?.focus();
    closeOnScroll(node, from.getRootNode());
  };
  const pick = (next: string | undefined) => {
    close(menu.current);
    trigger.current?.focus();
    onPick(next);
  };

  return createElement(
    Fragment,
    null,
    createElement(
      "button",
      {
        type: "button",
        className: "mk-mock-pick mk-press",
        "aria-haspopup": "menu",
        "aria-label": `${label}: ${chosen?.label ?? ""}`,
        "data-mk-real": String(chosen?.real === true),
        ref: trigger,
        onClick: toggle,
      },
      chosen && optionText(chosen),
      createElement(ChevronIcon, { className: "mk-mock-chevron", size: 11 }),
    ),
    createElement(
      "div",
      {
        className: "mk-mock-menu",
        popover: "auto",
        role: "menu",
        "aria-label": label,
        ref: menu,
        onKeyDown: move,
      },
      options.map((option) =>
        createElement(
          "button",
          {
            key: option.label,
            type: "button",
            role: "menuitemradio",
            className: "mk-mock-item",
            "aria-checked": option.value === value,
            onClick: () => pick(option.value),
          },
          optionText(option),
        ),
      ),
    ),
  );
}

function optionText(option: MenuOption): ReactElement {
  return createElement(
    Fragment,
    null,
    option.real === true &&
      createElement("span", { className: "mk-mock-dot", "aria-hidden": true }),
    createElement("span", null, option.label),
  );
}

/** Up and down between the items, as a menu's arrow keys go. */
function move(event: KeyboardEvent<HTMLDivElement>): void {
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (step === undefined) return;
  event.preventDefault();
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
  const here = items.indexOf(event.target as HTMLElement);
  items[(here + step + items.length) % items.length]?.focus();
}

/** The trigger moves when the box scrolls and the menu would not. Any close drops the listener. */
function closeOnScroll(node: HTMLElement, root: Node): void {
  const off = new AbortController();
  const signal = off.signal;
  root.addEventListener("scroll", () => close(node), { capture: true, signal });
  node.addEventListener("toggle", () => node.matches(":popover-open") || off.abort(), { signal });
}

function close(node: HTMLElement | null): void {
  if (node?.matches(":popover-open") === true) node.hidePopover();
}

/** Under the trigger and flush with its right edge, or above it when there is no room. */
function place(node: HTMLElement, anchor: DOMRect): void {
  const box = node.getBoundingClientRect();
  const below = anchor.bottom + 4;
  const y =
    below + box.height <= window.innerHeight - EDGE_PX ? below : anchor.top - 4 - box.height;
  const x = Math.max(EDGE_PX, anchor.right - box.width);
  node.style.setProperty("--mk-x", `${String(Math.round(x))}px`);
  node.style.setProperty("--mk-y", `${String(Math.round(Math.max(EDGE_PX, y)))}px`);
}
