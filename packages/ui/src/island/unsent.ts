/**
 * `Maple.Unsent`: the comments written here that nobody else can see yet.
 *
 * A comment is a draft until it is published, and the copy in the composer
 * said so — "it is kept here" — while nothing on the island showed a "here".
 * This is that place: what is waiting, the one control that sends it, and the
 * way out for a reviewer with no store to send it to.
 */

import { useMaple, useMapleClient } from "@maple-kit/react";
import { createElement, forwardRef, useState } from "react";

import { cx } from "../cx.js";
import { draftRoute, isOnPage, pathOf, usePathname } from "../marks/route.js";
import { renderPart } from "../part.js";
import { UNSENT_COPY } from "./language.js";

import type { PartProps } from "../part.js";
import type { MapleClient } from "@maple-kit/core/client";
import type { Draft } from "@maple-kit/core/overlay";
import type { MouseEvent, ReactNode } from "react";

/** The section. Its children replace everything inside it. */
export interface UnsentProps extends PartProps {
  readonly children?: ReactNode;
}

/** How long the copy control says it copied before going back to the offer. */
const COPIED_MS = 1600;

/** The unsent list, drawn only while something is waiting in it. */
export const Unsent = /** @__PURE__ */ forwardRef<HTMLDivElement, UnsentProps>(
  function Unsent(props, ref) {
    const { asChild, children, className, ...rest } = props;
    const { drafts, publishing } = useMaple();
    const client = useMapleClient();
    const [copied, setCopied] = useState(false);
    const pathname = usePathname(typeof window === "undefined" ? undefined : window);

    if (drafts.length === 0) return null;

    const copy = (): void => {
      void navigator.clipboard.writeText(client.draftsAsMarkdown()).then(
        () => {
          setCopied(true);
          setTimeout(() => setCopied(false), COPIED_MS);
        },
        () => undefined,
      );
    };

    const save = (event: MouseEvent<HTMLButtonElement>): void =>
      download(event.currentTarget.ownerDocument, "maple-drafts.json", client.draftsAsJson());

    return renderPart(
      "div",
      asChild,
      { ...rest, className: cx("mk-unsent", className), ref },
      children ?? [
        createElement(
          "div",
          { key: "head", className: "mk-unsent-head" },
          createElement(
            "span",
            { className: "mk-unsent-label" },
            UNSENT_COPY.heading(drafts.length),
          ),
          createElement(
            "button",
            {
              type: "button",
              className: "mk-unsent-copy",
              title: UNSENT_COPY.copyHint,
              onClick: copy,
            },
            copied ? UNSENT_COPY.copied : UNSENT_COPY.copy,
          ),
          createElement(
            "button",
            {
              type: "button",
              className: "mk-unsent-copy",
              title: UNSENT_COPY.exportHint,
              onClick: save,
            },
            UNSENT_COPY.export,
          ),
          createElement(
            "button",
            {
              type: "button",
              className: "mk-btn mk-btn-primary mk-press mk-unsent-publish",
              disabled: publishing,
              onClick: () => void client.publish().catch(() => undefined),
            },
            publishing ? UNSENT_COPY.publishing : UNSENT_COPY.publish(drafts.length),
          ),
        ),
        createElement(
          "ul",
          { key: "rows", className: "mk-unsent-rows" },
          ...drafts.map((draft) => row(draft, client, pathname)),
        ),
      ],
    );
  },
);

/** Hands the browser a file to save. */
function download(page: Document, name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = page.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** One waiting comment: what it says, where it belongs, and what to do with it. */
function row(draft: Draft, client: MapleClient, pathname: string): ReactNode {
  const route = draftRoute(draft);
  return createElement(
    "li",
    { key: draft.id, className: "mk-unsent-row" },
    createElement(
      "button",
      {
        type: "button",
        className: "mk-unsent-body",
        title: UNSENT_COPY.resumeHint,
        onClick: () => client.resumeDraft(draft.id),
      },
      draft.body.trim() === "" ? UNSENT_COPY.blank : draft.body,
    ),
    route === undefined || isOnPage(draft, pathname)
      ? null
      : createElement(
          "a",
          {
            className: "mk-unsent-where",
            href: route,
          },
          UNSENT_COPY.elsewhere(pathOf(route) ?? route),
        ),
    createElement(
      "button",
      {
        type: "button",
        className: "mk-unsent-drop",
        "aria-label": UNSENT_COPY.discard,
        title: UNSENT_COPY.discard,
        onClick: () => client.discardDraft(draft.id),
      },
      UNSENT_COPY.discardGlyph,
    ),
  );
}
