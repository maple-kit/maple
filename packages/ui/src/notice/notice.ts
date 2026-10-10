/**
 * `Maple.Notice`: the one surface that says a request did not work.
 *
 * Without it every failure was silent. A 401 on the list read as "nothing
 * here under this filter", and a 401 on a send read as a button that did not
 * hear the click — which is worse than an error, because a reviewer retries a
 * button and gives up on a sentence that says why. The offer is part of the
 * notice: a 401 is fixed by signing in, and nothing else is.
 */

import { useMaple, useMapleClient } from "@maple-kit/react";
import { createElement, forwardRef } from "react";

import { cx } from "../cx.js";
import { renderPart } from "../part.js";
import { SOLO_COPY } from "../solo.js";
import { isSetupGap, NOTICE_COPY, offersSignIn } from "./language.js";

import type { PartProps } from "../part.js";
import type { FailedCall, GitHubLink, MapleFailure } from "@maple-kit/core/client";
import type { ReactNode } from "react";

/** Which failures this notice answers for. */
export interface MapleNoticeProps extends PartProps {
  /**
   * The calls this notice speaks for. A notice beside the send button should
   * not also announce a failed load behind it. Every call unless given.
   */
  readonly during?: readonly FailedCall[];
}

/** The failure, in a line, with the one thing that would fix it. */
export const MapleNotice = /** @__PURE__ */ forwardRef<HTMLElement, MapleNoticeProps>(
  function MapleNotice(props, ref) {
    const { asChild, className, during, ...rest } = props;
    const { error, github, solo } = useMaple();
    const client = useMapleClient();

    if (!error || (during && !during.includes(error.during))) return null;

    return renderPart(
      "div",
      asChild,
      {
        ...rest,
        role: "alert",
        "data-mk-kind": error.kind,
        className: cx("mk-notice", className),
        ref,
      },
      [
        createElement(
          "span",
          { key: "said", className: "mk-notice-said" },
          ...said(error, github, solo, client),
        ),
        createElement(
          "button",
          {
            key: "off",
            type: "button",
            className: "mk-iconbtn mk-notice-off mk-hit",
            "aria-label": NOTICE_COPY.dismiss,
            onClick: () => client.clearError(),
          },
          NOTICE_COPY.dismissGlyph,
        ),
      ],
    );
  },
);

/** The failure's sentence with its one fix set in it as a link, or none where none helps. */
function said(
  error: MapleFailure,
  github: GitHubLink,
  solo: boolean,
  client: ReturnType<typeof useMapleClient>,
): readonly ReactNode[] {
  if (solo && soloBroke(error)) {
    return [SOLO_COPY.gone, " ", link(SOLO_COPY.leave, () => void client.endSolo())];
  }
  if (isSetupGap(error.kind, github)) return [NOTICE_COPY.noSignIn];

  const lead = NOTICE_COPY.signIn;
  if (offersSignIn(error.kind, github.state === "failed" || github.state === "unlinked")) {
    const signIn = link(lead, () => void client.linkGitHub());
    return error.message.startsWith(lead)
      ? [signIn, error.message.slice(lead.length)]
      : [error.message, " ", signIn];
  }
  if (error.kind !== "unauthorized" && error.during === "load") {
    return [error.message, " ", link(NOTICE_COPY.retry, () => void client.load())];
  }
  return [error.message];
}

/** A paired bridge that did not answer, or turned the page away: nobody signs in to it. */
function soloBroke(error: MapleFailure): boolean {
  return error.kind === "offline" || error.kind === "unauthorized";
}

function link(label: string, onClick: () => void): ReactNode {
  return createElement(
    "button",
    { key: label, type: "button", className: "mk-link", onClick },
    label,
  );
}
