/**
 * `Maple.Account`: the row a reviewer links their GitHub account from.
 *
 * It draws nothing at all when the route serves no sign-in, which is not the
 * same as a reviewer who has not linked — one is a deployment storing comments
 * some other way, the other is an offer worth making. The code is selectable
 * text rather than a button, because a reviewer types it on another device as
 * often as they copy it.
 */

import { useGitHubLink, useMapleClient } from "@maple-kit/react";
import { createElement, forwardRef } from "react";

import { cx } from "../cx.js";
import { renderPart } from "../part.js";
import { ACCOUNT_COPY } from "./language.js";

import type { PartProps } from "../part.js";
import type { GitHubLink, MapleClient } from "@maple-kit/core/client";
import type { ReactNode } from "react";

/** The row. Its children replace everything inside it. */
export interface AccountProps extends PartProps {
  readonly children?: ReactNode;
}

/** The GitHub link, as one row of the settings panel. */
export const Account = /** @__PURE__ */ forwardRef<HTMLDivElement, AccountProps>(
  function Account(props, ref) {
    const { asChild, children, className, ...rest } = props;
    const link = useGitHubLink();
    const client = useMapleClient();

    if (link.state === "unsupported") return null;

    return renderPart(
      "div",
      asChild,
      { ...rest, className: cx("mk-setting", className), "data-mk-link": link.state, ref },
      children ?? [
        createElement(
          "span",
          { key: "said" },
          createElement("span", { className: "mk-setting-name" }, ACCOUNT_COPY.name),
          createElement("span", { className: "mk-setting-hint" }, said(link)),
          code(link),
        ),
        action(link, client),
      ],
    );
  },
);

/** One sentence per state, and the failure carries the route's own words. */
function said(link: GitHubLink): string {
  if (link.state === "linked") return ACCOUNT_COPY.linkedAs(login(link.login));
  if (link.state === "linking") return ACCOUNT_COPY.linking;
  if (link.state === "failed") return link.reason;
  return ACCOUNT_COPY.unlinked;
}

function login(name: string | undefined): string | undefined {
  return name === undefined ? undefined : `@${name}`;
}

/** The code and where to type it, shown only while a link is waiting. */
function code(link: GitHubLink): ReactNode {
  if (link.state !== "linking") return null;

  return createElement(
    "span",
    { key: "code", className: "mk-acct-code" },
    createElement("code", null, link.userCode),
    createElement(
      "a",
      { href: link.verificationUri, target: "_blank", rel: "noreferrer noopener" },
      ACCOUNT_COPY.open,
    ),
  );
}

/** Nothing to press while a link is in flight: the reviewer is on github.com. */
function action(link: GitHubLink, client: MapleClient): ReactNode {
  if (link.state === "linking") return null;

  const linked = link.state === "linked";
  const offer = link.state === "failed" ? ACCOUNT_COPY.retry : ACCOUNT_COPY.link;
  const label = linked ? ACCOUNT_COPY.unlink : offer;

  return createElement(
    "button",
    {
      key: "act",
      type: "button",
      className: "mk-acct-do",
      ...(linked ? { title: ACCOUNT_COPY.unlinkHint } : {}),
      onClick: () => void (linked ? client.unlinkGitHub() : client.linkGitHub()),
    },
    label,
  );
}
