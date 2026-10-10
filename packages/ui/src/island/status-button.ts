/**
 * Resolve or Reopen, which the row and the card both offer.
 *
 * One component rather than two buttons that could drift: the same call, the
 * same label, and the same ring while the store answers.
 */

import { useMapleClient } from "@maple-kit/react";
import { createElement } from "react";

import { cx } from "../cx.js";
import { spun, useBusy } from "../spinner.js";
import { ISLAND_COPY } from "./language.js";

import type { MouseEvent, ReactElement } from "react";

/** Which comment, where it stands, and what else the button wears. */
export interface StatusButtonProps {
  readonly id: string;
  readonly done: boolean;
  readonly className?: string | undefined;
  /** The row opens on a click; its quick button must not. */
  readonly stop?: boolean;
}

/** Moves a comment between open and resolved. */
export function StatusButton(props: StatusButtonProps): ReactElement {
  const client = useMapleClient();
  const [busy, run] = useBusy();

  const onClick = (event: MouseEvent): void => {
    if (props.stop === true) event.stopPropagation();
    run(() => client.setStatus(props.id, props.done ? "open" : "resolved"));
  };

  const label = props.done ? ISLAND_COPY.reopen : ISLAND_COPY.resolve;

  return createElement(
    "button",
    {
      type: "button",
      className: cx("mk-btn mk-press", props.className),
      disabled: busy,
      "aria-busy": busy,
      onClick,
    },
    busy ? spun(label) : label,
  );
}
