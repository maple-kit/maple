/**
 * `Maple.CommentButton`: the header's way to start a comment.
 *
 * It is the comment tap as a control: the kind armed last, and again the next.
 * Arming collapses the card, out of the way of what is being picked; cycling
 * from a card the viewer reopened leaves it up.
 */

import { commentTapLabel } from "@maple-kit/core/client";
import { useMapleClient, usePicker } from "@maple-kit/react";
import { createElement, forwardRef } from "react";

import { cx } from "../cx.js";
import { CommentIcon } from "../icons/comment.js";
import { renderPart } from "../part.js";
import { useIsland } from "./context.js";
import { ISLAND_COPY } from "./language.js";

import type { PartProps } from "../part.js";
import type { ReactNode } from "react";

/** The comment control. Its children replace the icon. */
export interface CommentButtonProps extends PartProps {
  readonly children?: ReactNode;
}

/** Arms a pick; pressed again while one is armed, moves to the next kind. */
export const CommentButton = /** @__PURE__ */ forwardRef<HTMLButtonElement, CommentButtonProps>(
  function CommentButton(props, ref) {
    const { asChild, children, className, ...rest } = props;
    const island = useIsland("<Maple.CommentButton>");
    const client = useMapleClient();
    const { armed } = usePicker();

    return renderPart(
      "button",
      asChild,
      {
        type: "button",
        title: `${ISLAND_COPY.newComment} (${commentTapLabel()})`,
        ...rest,
        "aria-label": ISLAND_COPY.newComment,
        "aria-pressed": armed,
        className: cx("mk-iconbtn mk-hit", className),
        onClick: () => {
          client.armNext();
          if (!armed) island.setOpen(false);
        },
        ref,
      },
      children ?? createElement(CommentIcon),
    );
  },
);
