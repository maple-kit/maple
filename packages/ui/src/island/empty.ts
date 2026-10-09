/**
 * The list's error state: a drawing, a title and a way to try again.
 *
 * A load that failed used to read as a branch with nothing on it, which stops
 * a reviewer looking, so it says it failed. The drawing is inline SVG in the
 * card's own colours and asks the host page for nothing.
 */

import { useMapleClient } from "@maple-kit/react";
import { createElement } from "react";

import { ISLAND_COPY } from "./language.js";

import type { ReactElement } from "react";

/** A comment bubble that did not arrive: dashed where it should be solid. */
function drawing(): ReactElement {
  return createElement(
    "svg",
    {
      viewBox: "0 0 88 64",
      width: 88,
      height: 64,
      className: "mk-empty-art",
      "aria-hidden": true,
      fill: "none",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    },
    createElement("path", {
      d: "M20 12h48a8 8 0 0 1 8 8v22a8 8 0 0 1-8 8H44l-12 10v-10H20a8 8 0 0 1-8-8V20a8 8 0 0 1 8-8z",
      stroke: "var(--mk-faint)",
      strokeWidth: 2,
      strokeDasharray: "3 5",
    }),
    createElement("path", { d: "M44 22v12", stroke: "var(--mk-lost)", strokeWidth: 3 }),
    createElement("circle", { cx: 44, cy: 41, r: 1.8, fill: "var(--mk-lost)" }),
    createElement("path", { d: "M70 4l2 4 4 2-4 2-2 4-2-4-4-2 4-2z", fill: "var(--mk-faint)" }),
  );
}

/** What the list shows in place of its rows when the comments could not be read. */
export function LoadFailed(): ReactElement {
  const client = useMapleClient();

  return createElement(
    "div",
    { className: "mk-empty mk-empty-error", role: "status" },
    drawing(),
    createElement("p", { className: "mk-empty-title" }, ISLAND_COPY.unread.title),
    createElement("p", { className: "mk-empty-line" }, ISLAND_COPY.unread.line),
    createElement(
      "button",
      {
        type: "button",
        className: "mk-btn mk-press mk-empty-retry",
        onClick: () => void client.load(),
      },
      ISLAND_COPY.unread.retry,
    ),
  );
}
