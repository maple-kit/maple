/**
 * The ring: a 2px outline and a short label naming what a comment is on.
 *
 * It is not scaffolding. Without it the composer asks a reviewer to remember
 * what they clicked, and they do not — this was the first thing that came back
 * in review. A passage gets one rectangle per line from `getClientRects`, so a
 * sentence wrapping over three lines is shown as the three lines it is.
 */

import { regionBox } from "@maple-kit/core/anchor";
import { createElement, forwardRef, useCallback, useRef, useState } from "react";

import { useMapleUi } from "../context.js";
import { composeRefs } from "../slot.js";
import { labelSpotFor } from "./clearance.js";
import { useFrameLoop, viewportHeight } from "./frame.js";
import { culled, ringBox, runBox } from "./geometry.js";
import { flag, MOVING_ATTRIBUTE, OFF_ATTRIBUTE, place } from "./paint.js";

import type { Box } from "./geometry.js";
import type { AnchorRegion } from "@maple-kit/core/anchor";
import type { ReactElement } from "react";

/** Set on the label when it was moved under the anchor to clear page text. */
export const BELOW_ATTRIBUTE = "data-mk-below";

/** The same, for the move to the anchor's far end. The two combine. */
export const END_ATTRIBUTE = "data-mk-end";

const PART = "Maple.TargetRing";

/**
 * Why the ring is showing. `selected` is the one that outlives the pointer:
 * a click holds the ring on the page after the hand has moved away.
 */
export type RingState = "composing" | "hovered" | "selected";

/** What the ring names, and the words it names it with. */
export interface TargetRingProps {
  /** The anchored element, or the passage itself when it is a text anchor. */
  readonly target?: Element | Range | null;
  /**
   * The rectangle a region pick drew, in fractions of the target's box. The
   * ring is that rectangle rather than the element it was measured in.
   */
  readonly region?: AnchorRegion;
  /** The label's words. `ringLabel` builds them; the ring never invents them. */
  readonly label?: string;
  /** A second line under the label. Developer detail: where this is written. */
  readonly note?: string;
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
    const { className, label, note, region, state = "composing", target } = props;
    const { container } = useMapleUi(PART);

    const ring = useRef<HTMLDivElement | null>(null);
    const cap = useRef<HTMLSpanElement | null>(null);
    const runs = useRef<(HTMLDivElement | null)[]>([]);
    const [lines, setLines] = useState(0);

    const paint = useCallback(
      (moving: boolean) => {
        const node = ring.current;
        if (!node || !target) return;

        const box = target.getBoundingClientRect();
        const rect = region === undefined ? box : regionBox(box, region);
        const away = empty(rect) || culled(rect, viewportHeight(container));
        flag(node, OFF_ATTRIBUTE, away);
        flag(node, MOVING_ATTRIBUTE, moving);
        if (away) return;

        const drawn = ringBox(rect);
        place(node, drawn);
        // Skipped while the page is moving under the ring: a corner re-decided
        // per scrolled frame flickers, and `scrollend` settles it again.
        if (cap.current && !moving) corner(cap.current, drawn, container);

        const boxes = region === undefined ? linesOf(target) : [];
        if (boxes.length !== lines) setLines(boxes.length);
        boxes.forEach((box, index) => {
          const run = runs.current[index];
          if (run) place(run, runBox(box, rect));
        });
      },
      [container, lines, region, target],
    );

    useFrameLoop(PART, paint);
    if (!target) return null;

    return createElement(
      "div",
      {
        className: className ? `mk-ring ${className}` : "mk-ring",
        "data-mk-state": state,
        "data-mk-passage": String(region === undefined && "startContainer" in target),
        "data-mk-region": String(region !== undefined),
        ref: composeRefs<HTMLDivElement>(ref, (node) => {
          ring.current = node;
        }),
      },
      label === undefined ? null : caption(label, note, cap),
      ...run(lines, runs),
    );
  },
);

/** Puts the label at the first corner of the ring with no page text in it. */
function corner(cap: HTMLSpanElement, ring: Box, overlay: Element): void {
  const drawn = { below: cap.hasAttribute(BELOW_ATTRIBUTE), end: cap.hasAttribute(END_ATTRIBUTE) };
  const spot = labelSpotFor({ ring, label: cap.getBoundingClientRect(), drawn }, overlay);

  flag(cap, BELOW_ATTRIBUTE, spot.below);
  flag(cap, END_ATTRIBUTE, spot.end);
}

/**
 * The name of the thing, and under it — in developer detail only — the file
 * it is written in, which is the next place the reader is going anyway.
 */
function caption(
  label: string,
  note: string | undefined,
  ref: { current: HTMLSpanElement | null },
): ReactElement {
  return createElement(
    "span",
    { className: "mk-ring-label", ref },
    createElement("span", { key: "name", className: "mk-ring-name mk-mono" }, label),
    note === undefined
      ? null
      : createElement("span", { key: "note", className: "mk-ring-note mk-mono" }, note),
  );
}

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
