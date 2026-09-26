/**
 * Enter and leave, rebuilt from over and out.
 *
 * React synthesises `onPointerEnter` from `pointerover`, and drops it when the
 * pointer arrives from a node another React root manages: it assumes that
 * root's `pointerout` already dispatched the enter. A root outside the shadow
 * root never sees the overlay's nodes, so on a React page it never does, and a
 * mark standing over the page was never entered. Over and out always arrive.
 */

import type { PointerEvent } from "react";

/** What an element spreads to be told the pointer came and went. */
export interface HoverHandlers {
  readonly onPointerOver: (event: PointerEvent<Element>) => void;
  readonly onPointerOut: (event: PointerEvent<Element>) => void;
}

/** True when the pointer only moved between the element and its own children. */
function within(event: PointerEvent<Element>): boolean {
  const other = event.relatedTarget;
  return other instanceof Node && event.currentTarget.contains(other);
}

/** Calls `enter` once as the pointer arrives and `leave` once as it goes. */
export function hoverHandlers(enter: () => void, leave: () => void): HoverHandlers {
  return {
    onPointerOver: (event) => {
      if (!within(event)) enter();
    },
    onPointerOut: (event) => {
      if (!within(event)) leave();
    },
  };
}
