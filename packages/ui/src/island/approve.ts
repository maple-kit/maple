/**
 * `Maple.Approve`: the button a reviewer signs off with.
 *
 * It answers the case the rest of the island cannot: a reviewer who looked
 * and had nothing to say. `docs/gate.md` argues the point. It is an icon with
 * its words as the label, drawn nothing where the store keeps no approvals.
 */

import { useMaple, useMapleClient } from "@maple-kit/react";
import { createElement, forwardRef } from "react";

import { cx } from "../cx.js";
import { CheckIcon } from "../icons/check.js";
import { renderPart } from "../part.js";
import { APPROVE_COPY } from "./language.js";

import type { PartProps } from "../part.js";
import type { ReactNode } from "react";

/** The button. Its children replace the icon. */
export interface ApproveProps extends PartProps {
  readonly children?: ReactNode;
}

/** The sign-off: a green check until given, then a neutral pressed one. */
export const Approve = /** @__PURE__ */ forwardRef<HTMLButtonElement, ApproveProps>(
  function Approve(props, ref) {
    const { asChild, children, className, ...rest } = props;
    const state = useMaple();
    const client = useMapleClient();

    if (state.approval?.supported !== true) return null;

    const mine = state.myApproval !== null;
    const signedIn = state.user !== null;
    return renderPart(
      "button",
      asChild,
      {
        type: "button",
        title: signedIn ? APPROVE_COPY.label : APPROVE_COPY.signIn,
        ...rest,
        "aria-label": APPROVE_COPY.label,
        "aria-pressed": mine,
        disabled: !signedIn,
        className: cx(
          "mk-icon-btn mk-approve mk-press",
          mine ? undefined : "mk-icon-btn-ok",
          className,
        ),
        onClick: () => void (mine ? client.unapprove() : client.approve()),
        ref,
      },
      children ?? createElement(CheckIcon, { size: 15 }),
    );
  },
);
