/**
 * The scroll loop: one animation frame per scrolled frame, for everything.
 *
 * Marks and the ring are absolutely positioned over a page that moves under
 * them, so they are measured and moved per frame rather than transitioned —
 * a transition on a position lags a frame behind the page and reads as broken.
 * One loop repaints all of them, because two loops disagree on a slow frame.
 */

import { useLayoutEffect, useRef } from "react";

import { useMapleUi } from "../context.js";

import type { Scroll, Viewport } from "./geometry.js";

/** What a loop repaints, told whether the page is currently moving under it. */
export type Paint = (moving: boolean) => void;

const PASSIVE: AddEventListenerOptions = { capture: true, passive: true };

/**
 * Repaints on scroll and resize, coalesced into one frame. `scrollend` is what
 * drops `will-change` again: a compositor layer held forever costs memory on a
 * page Maple is only a guest on.
 */
export function startFrameLoop(view: Window, paint: Paint): () => void {
  let frame = 0;
  let moving = false;

  const run = () => {
    frame = 0;
    paint(moving);
  };
  const schedule = () => {
    if (frame === 0) frame = view.requestAnimationFrame(run);
  };
  const onScroll = () => {
    moving = true;
    schedule();
  };
  const onSettle = () => {
    moving = false;
    schedule();
  };

  view.addEventListener("scroll", onScroll, PASSIVE);
  view.addEventListener("scrollend", onSettle, PASSIVE);
  view.addEventListener("resize", schedule, PASSIVE);

  return () => {
    view.removeEventListener("scroll", onScroll, PASSIVE);
    view.removeEventListener("scrollend", onSettle, PASSIVE);
    view.removeEventListener("resize", schedule, PASSIVE);
    if (frame !== 0) view.cancelAnimationFrame(frame);
  };
}

/**
 * Runs a loop for as long as a part is mounted, and repaints after every
 * render, so nothing is ever seen at the position React first rendered it at.
 */
export function useFrameLoop(part: string, paint: Paint): void {
  const { container } = useMapleUi(part);
  const latest = useRef(paint);

  useLayoutEffect(() => {
    latest.current = paint;
    paint(false);
  });

  useLayoutEffect(() => {
    const view = container.ownerDocument.defaultView;
    if (!view) return;
    return startFrameLoop(view, (moving) => latest.current(moving));
  }, [container]);
}

/** The page's visible area, scrollbars excluded, and how far it is scrolled. */
export function pageView(container: Element): Viewport & { readonly scroll: Scroll } {
  const view = container.ownerDocument.defaultView;
  const root = container.ownerDocument.documentElement;
  return {
    width: root.clientWidth || view?.innerWidth || 0,
    height: root.clientHeight || view?.innerHeight || 0,
    scroll: { x: view?.scrollX ?? 0, y: view?.scrollY ?? 0 },
  };
}
