/**
 * The ring: a 2px outline and a short label naming what a comment is on.
 *
 * It is not scaffolding. Without it the composer asks a reviewer to remember
 * what they clicked, and they do not — this was the first thing that came back
 * in review. A passage gets one rectangle per line from `getClientRects`, so a
 * sentence wrapping over three lines is shown as the three lines it is.
 */

import { createElement, forwardRef, useCallback, useRef, useState } from "react";

import { useMapleUi } from "../context.js";
import { composeRefs } from "../slot.js";
import { useFrameLoop, viewportHeight } from "./frame.js";
import { culled, ringBox, runBox } from "./geometry.js";
import { flag, MOVING_ATTRIBUTE, OFF_ATTRIBUTE, place } from "./paint.js";

import type { Box } from "./geometry.js";
import type { ReactElement } from "react";

/** Set on the label when the anchor is too near the top to sit above it. */
export const BELOW_ATTRIBUTE = "data-mk-below";

/** How much room the label needs above the anchor before it moves below it. */
const LABEL_ROOM_PX = 26;

const PART = "Maple.TargetRing";

/** Why the ring is showing: a composer is open on it, or something hovers it. */
export type RingState = "composing" | "hovered";

/** What the ring names, and the words it names it with. */
export interface TargetRingProps {
  /** The anchored element, or the passage itself when it is a text anchor. */
  readonly target?: Element | Range | null;
  /** The label's words. `ringLabel` builds them; the ring never invents them. */
  readonly label?: string;
  readonly state?: RingState;
  readonly className?: string;
}

/** A range answers for every line it covers; an element answers for itself. */
function linesOf(target: Element | Range): readonly Box[] {
  return "startContainer" in target ? [...target.getClientRects()] : [];
}

/** True when there is nothing to draw around, which a hidden element gives. */
function empty(rect: Box): boolean {
  return rect.width === 0 && rect.height === 0;
}

/** The ring around one target, repositioned per scrolled frame. */
export const MapleTargetRing = /** @__PURE__ */ forwardRef<HTMLDivElement, TargetRingProps>(
  function MapleTargetRing(props, ref) {
    const { className, label, state = "composing", target } = props;
    const { container } = useMapleUi(PART);

    const ring = useRef<HTMLDivElement | null>(null);
    const cap = useRef<HTMLSpanElement | null>(null);
    const runs = useRef<(HTMLDivElement | null)[]>([]);
    const [lines, setLines] = useState(0);

    const paint = useCallback(
      (moving: boolean) => {
        const node = ring.current;
        if (!node || !target) return;

        const rect = target.getBoundingClientRect();
        const away = empty(rect) || culled(rect, viewportHeight(container));
        flag(node, OFF_ATTRIBUTE, away);
        flag(node, MOVING_ATTRIBUTE, moving);
        if (away) return;

        place(node, ringBox(rect));
        if (cap.current) flag(cap.current, BELOW_ATTRIBUTE, rect.y < LABEL_ROOM_PX);

        const boxes = linesOf(target);
        if (boxes.length !== lines) setLines(boxes.length);
        boxes.forEach((box, index) => {
          const run = runs.current[index];
          if (run) place(run, runBox(box, rect));
        });
      },
      [container, lines, target],
    );

    useFrameLoop(PART, paint);
    if (!target) return null;

    return createElement(
      "div",
      {
        className: className ? `mk-ring ${className}` : "mk-ring",
        "data-mk-state": state,
        "data-mk-passage": String("startContainer" in target),
        ref: composeRefs<HTMLDivElement>(ref, (node) => {
          ring.current = node;
        }),
      },
      label ? createElement("span", { className: "mk-ring-label mk-mono", ref: cap }, label) : null,
      ...run(lines, runs),
    );
  },
);

/** One rectangle per line, positioned inside the ring rather than the page. */
function run(lines: number, runs: { current: (HTMLDivElement | null)[] }): ReactElement[] {
  return Array.from({ length: lines }, (_, index) =>
    createElement("div", {
      key: index,
      className: "mk-ring-run",
      ref: (node: HTMLDivElement | null) => {
        runs.current[index] = node;
      },
    }),
  );
}
