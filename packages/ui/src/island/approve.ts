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
import { renderPart } from "../part.js";
import { APPROVE_COPY } from "./language.js";

import type { PartProps } from "../part.js";
import type { ReactNode } from "react";

/** The button. Its children replace the icon. */
export interface ApproveProps extends PartProps {
  readonly children?: ReactNode;
}

/** The sign-off, as one green check in the toolbar group. */
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
        className: cx("mk-icon-btn mk-approve mk-press", className),
        onClick: () => void (mine ? client.unapprove() : client.approve()),
        ref,
      },
      children ?? checkCircle(),
    );
  },
);

/** A filled circle with the check cut out of it, so it takes the button's colour. */
function checkCircle(): ReactNode {
  return createElement(
    "svg",
    {
      viewBox: "0 0 24 24",
      width: 15,
      height: 15,
      "aria-hidden": true,
      className: "mk-approve-icon",
    },
    createElement("circle", { cx: 12, cy: 12, r: 11, fill: "currentColor" }),
    createElement("path", {
      d: "M7.2 12.4l3.2 3.2 6.4-6.6",
      fill: "none",
      stroke: "var(--mk-on-ok, #fff)",
      strokeWidth: 2.2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    }),
  );
}
