/**
 * `Maple.Unsent`: the one line that says some comments are not published.
 *
 * The comments themselves are rows under the Drafts filter, drawn as every
 * other comment is. This is only the way to send them, with the two ways out
 * for a reviewer with no store to send them to behind the arrow.
 */

import { useMaple, useMapleClient } from "@maple-kit/react";
import { createElement, forwardRef, useState } from "react";

import { cx } from "../cx.js";
import { renderPart } from "../part.js";
import { UNSENT_COPY } from "./language.js";

import type { PartProps } from "../part.js";
import type { MapleClient } from "@maple-kit/core/client";
import type { FocusEvent, ReactNode } from "react";

/** The line. Its children replace everything inside it. */
export interface UnsentProps extends PartProps {
  readonly children?: ReactNode;
}

/** How long the button says it copied before going back to Publish. */
const COPIED_MS = 1600;

/** The unsent line, drawn only while something is waiting. */
export const Unsent = /** @__PURE__ */ forwardRef<HTMLDivElement, UnsentProps>(
  function Unsent(props, ref) {
    const { asChild, children, className, ...rest } = props;
    const { drafts, publishing } = useMaple();
    const client = useMapleClient();
    const [copied, setCopied] = useState(false);
    const [open, setOpen] = useState(false);

    if (drafts.length === 0) return null;

    const copy = (text: string): void => {
      setOpen(false);
      void navigator.clipboard.writeText(text).then(
        () => {
          setCopied(true);
          setTimeout(() => setCopied(false), COPIED_MS);
        },
        () => undefined,
      );
    };

    return renderPart(
      "div",
      asChild,
      { ...rest, className: cx("mk-unsent", className), ref },
      children ?? [
        createElement("span", { key: "line", className: "mk-unsent-label" }, UNSENT_COPY.line),
        createElement(
          "span",
          {
            key: "split",
            className: "mk-split",
            onBlur: (event: FocusEvent<HTMLElement>) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
            },
          },
          createElement(
            "button",
            {
              type: "button",
              className: "mk-btn mk-btn-primary mk-press mk-split-main",
              disabled: publishing,
              onClick: () => void client.publish().catch(() => undefined),
            },
            label(publishing, copied),
          ),
          createElement(
            "button",
            {
              type: "button",
              className: "mk-btn mk-btn-primary mk-press mk-split-more",
              "aria-label": UNSENT_COPY.more,
              "aria-haspopup": "menu",
              "aria-expanded": open,
              onClick: () => setOpen(!open),
            },
            createElement("span", { className: "mk-split-chevron", "aria-hidden": true }),
          ),
          open ? menu(client, copy) : null,
        ),
      ],
    );
  },
);

/** The two exports, both to the clipboard: nothing here downloads a file. */
function menu(client: MapleClient, copy: (text: string) => void): ReactNode {
  const item = (label: string, text: () => string) =>
    createElement(
      "button",
      {
        key: label,
        type: "button",
        role: "menuitem",
        className: "mk-split-item",
        onClick: () => copy(text()),
      },
      label,
    );

  return createElement(
    "div",
    { key: "menu", role: "menu", className: "mk-split-menu" },
    item(UNSENT_COPY.markdown, () => client.draftsAsMarkdown()),
    item(UNSENT_COPY.json, () => client.draftsAsJson()),
  );
}

/** Publish, with the moment it is busy or has just copied told in its place. */
function label(publishing: boolean, copied: boolean): string {
  if (publishing) return UNSENT_COPY.publishing;
  return copied ? UNSENT_COPY.copied : UNSENT_COPY.publish;
}
