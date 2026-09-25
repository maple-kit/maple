/**
 * `Maple.IslandContent`: the card the pill opens into.
 *
 * It is mounted once and kept: changing a filter swaps the rows inside it and
 * never rebuilds it, because rebuilding re-ran the entrance and re-measured
 * the height and read as a flicker. The close animates before the unmount, so
 * the exit is a close rather than a disappearance, and it is never delayed.
 */

import { forwardRef } from "react";

import { cx } from "../cx.js";
import { renderPart } from "../part.js";
import { useIsland } from "./context.js";
import { ISLAND_COPY } from "./language.js";

import type { PartProps } from "../part.js";
import type { AnimationEvent, ReactNode } from "react";

/** The card. Everything the island shows when it is open goes inside it. */
export interface IslandContentProps extends PartProps {
  readonly children?: ReactNode;
}

const PART = "<Maple.IslandContent>";

/** Mounted while the island is open, and through its exit. */
export const IslandContent = /** @__PURE__ */ forwardRef<HTMLDivElement, IslandContentProps>(
  function IslandContent(props, ref) {
    const { asChild, children, className, ...rest } = props;
    const island = useIsland(PART);

    if (island.phase === "closed") return null;

    const onAnimationEnd = (event: AnimationEvent<HTMLElement>) => {
      if (island.phase === "closing" && event.target === event.currentTarget) island.settled();
    };

    return renderPart(
      "div",
      asChild,
      {
        role: "region",
        ...rest,
        id: island.contentId,
        "aria-label": ISLAND_COPY.title,
        "data-mk-phase": island.phase,
        className: cx("mk-card mk-surface", className),
        onAnimationEnd,
        ref,
      },
      children,
    );
  },
);
