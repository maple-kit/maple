/**
 * `Maple.IslandTrigger`: the pill, and the whole of the island at rest.
 *
 * One number, and it is the open one — everything not resolved, unpinned
 * included. Splitting it into "open · lost" was tried and read as noise:
 * whether a comment is dealt with is the question a count answers. It is also
 * the island's handle: dragging it moves the island out of the way of the
 * thing under review, and lets go into the nearest corner.
 */

import { useMaple } from "@maple-kit/react";
import { forwardRef } from "react";

import { cx } from "../cx.js";
import { dataAttributes } from "../data.js";
import { renderPart } from "../part.js";
import { useIsland } from "./context.js";
import { openLabel, triggerLabel } from "./language.js";
import { Leaf } from "./leaf.js";

import type { PartProps } from "../part.js";
import type { ReactNode } from "react";

/** The pill. Its own children replace the leaf and the count. */
export interface IslandTriggerProps extends PartProps {
  readonly children?: ReactNode;
}

const PART = "<Maple.IslandTrigger>";

/** `8 open`, and the hit area a thumb needs around it. */
export const IslandTrigger = /** @__PURE__ */ forwardRef<HTMLButtonElement, IslandTriggerProps>(
  function IslandTrigger(props, ref) {
    const { asChild, children, className, ...rest } = props;
    const island = useIsland(PART);
    const { openCount, pick } = useMaple();

    return renderPart(
      "button",
      asChild,
      {
        type: "button",
        ...dataAttributes({ armed: pick.armed }),
        ...rest,
        "aria-controls": island.contentId,
        "aria-expanded": island.phase !== "closed",
        "aria-label": triggerLabel(openCount),
        className: cx("mk-pill mk-hit", className),
        onClick: () => {
          if (!island.drag.moved()) island.setOpen(island.phase === "closed");
        },
        onPointerDown: island.drag.onPointerDown,
        onPointerMove: island.drag.onPointerMove,
        onPointerUp: island.drag.onPointerUp,
        ref,
      },
      children ?? [
        renderPart(Leaf, false, { key: "leaf", size: 15, className: "mk-logo-leaf" }),
        renderPart("span", false, { key: "count", className: "mk-num" }, openLabel(openCount)),
      ],
    );
  },
);
