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
import { SOLO_COPY, SoloOffer } from "../solo.js";
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
          said(error, github, solo),
          error.kind === "unauthorized" ? createElement(SoloOffer) : null,
        ),
        offer(error, github, solo, client),
        createElement(
          "button",
          {
            key: "off",
            type: "button",
            className: "mk-notice-off mk-hit",
            "aria-label": NOTICE_COPY.dismiss,
            onClick: () => client.clearError(),
          },
          NOTICE_COPY.dismissGlyph,
        ),
      ],
    );
  },
);

/** The failure's own sentence, or the setup gap's, which names no door. */
function said(error: MapleFailure, github: GitHubLink, solo: boolean): string {
  if (solo && soloBroke(error)) return SOLO_COPY.gone;
  return isSetupGap(error.kind, github) ? NOTICE_COPY.noSignIn : error.message;
}

/** Sign in, or try again. Nothing is offered where neither would help. */
function offer(
  error: MapleFailure,
  github: GitHubLink,
  solo: boolean,
  client: ReturnType<typeof useMapleClient>,
): ReactNode {
  if (solo && soloBroke(error)) return button(SOLO_COPY.leave, () => void client.endSolo());
  if (offersSignIn(error.kind, github.state === "failed" || github.state === "unlinked")) {
    return button(NOTICE_COPY.signIn, () => void client.linkGitHub());
  }
  if (error.kind === "unauthorized") return null;
  return error.during === "load" ? button(NOTICE_COPY.retry, () => void client.load()) : null;
}

/** A paired bridge that did not answer, or turned the page away: nobody signs in to it. */
function soloBroke(error: MapleFailure): boolean {
  return error.kind === "offline" || error.kind === "unauthorized";
}

function button(label: string, onClick: () => void): ReactNode {
  return createElement(
    "button",
    { key: "do", type: "button", className: "mk-notice-do mk-press", onClick },
    label,
  );
}
