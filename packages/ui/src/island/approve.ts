/**
 * `Maple.Approve`: the row a reviewer signs off from.
 *
 * It answers the case the rest of the island cannot — a reviewer who looked
 * and had nothing to say. Without it the gate reads the same green for that
 * review as for one that never happened; `docs/gate.md` argues the point.
 *
 * It draws nothing where the store keeps no approvals, as `Account` draws
 * nothing where the route serves no sign-in.
 */

import { useMaple, useMapleClient } from "@maple-kit/react";
import { createElement, forwardRef } from "react";

import { cx } from "../cx.js";
import { renderPart } from "../part.js";
import { APPROVE_COPY } from "./language.js";

import type { PartProps } from "../part.js";
import type { Approval } from "@maple-kit/core";
import type { ClientState, MapleClient } from "@maple-kit/core/client";
import type { ReactNode } from "react";

/** The row. Its children replace everything inside it. */
export interface ApproveProps extends PartProps {
  readonly children?: ReactNode;
}

/** The sign-off, as one row above the picks. */
export const Approve = /** @__PURE__ */ forwardRef<HTMLDivElement, ApproveProps>(
  function Approve(props, ref) {
    const { asChild, children, className, ...rest } = props;
    const state = useMaple();
    const client = useMapleClient();

    if (state.approval?.supported !== true) return null;

    const mine = state.myApproval;
    return renderPart(
      "div",
      asChild,
      {
        ...rest,
        className: cx("mk-approve", className),
        "data-mk-approved": mine === null ? "no" : "yes",
        ref,
      },
      children ?? [
        createElement("span", { key: "said", className: "mk-approve-said" }, said(state, mine)),
        control(state, mine, client),
      ],
    );
  },
);

/**
 * One sentence, from whether this reviewer signed, whether anybody else did,
 * and whether the gate waits. "Approve" alone is a button nobody presses.
 */
function said(state: ClientState, mine: Approval | null): string {
  if (mine) return APPROVE_COPY.yours;

  const others = state.approvals.length;
  if (others > 0) return APPROVE_COPY.others(state.approvals[0]?.author.name, others);
  return state.approval?.required === true ? APPROVE_COPY.wanted : APPROVE_COPY.offered;
}

/**
 * A guest sees the offer and cannot take it: the route refuses an approval
 * nobody can be named for. Saying so beats answering a click with a red line.
 */
function control(state: ClientState, mine: Approval | null, client: MapleClient): ReactNode {
  const signedIn = state.user !== null;

  return createElement(
    "button",
    {
      key: "act",
      type: "button",
      className: "mk-approve-do mk-press",
      disabled: !signedIn,
      ...(signedIn ? {} : { title: APPROVE_COPY.signIn }),
      onClick: () => void (mine ? client.unapprove() : client.approve()),
    },
    mine ? APPROVE_COPY.withdraw : APPROVE_COPY.approve,
  );
}
