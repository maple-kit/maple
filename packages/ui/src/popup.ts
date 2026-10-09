/**
 * `Popup`: a small modal card over the page, for the two things the island
 * has no room to say inline — how to sign in, and what to do when you cannot.
 *
 * It is a native `<dialog>` opened with `showModal()`, so the browser owns the
 * focus trap, Escape and the top layer. The card's own clip, which would cut a
 * positioned child off, never sees it.
 */

import { createElement, useEffect, useId, useRef } from "react";

import { ISLAND_COPY } from "./island/language.js";

import type { MouseEvent, ReactElement, ReactNode } from "react";

/** What a popup needs: a name, a way out, and its body. */
export interface PopupProps {
  readonly title: string;
  readonly onClose: () => void;
  readonly children?: ReactNode;
}

/** Drawn open, and closed by unmounting it. */
export function Popup(props: PopupProps): ReactElement {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      dialog.focus();
    }
    return () => dialog?.close();
  }, []);

  const onClick = (event: MouseEvent<HTMLDialogElement>): void => {
    if (event.target === event.currentTarget) props.onClose();
  };

  return createElement(
    "dialog",
    {
      ref,
      className: "mk-popup",
      tabIndex: -1,
      "aria-labelledby": titleId,
      onClose: props.onClose,
      onClick,
    },
    createElement(
      "div",
      { className: "mk-popup-head" },
      createElement("h2", { id: titleId, className: "mk-popup-title" }, props.title),
      createElement(
        "button",
        {
          type: "button",
          className: "mk-iconbtn mk-hit",
          "aria-label": ISLAND_COPY.close,
          onClick: props.onClose,
        },
        ISLAND_COPY.closeGlyph,
      ),
    ),
    createElement("div", { className: "mk-popup-body" }, props.children),
  );
}
