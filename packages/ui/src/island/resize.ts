/**
 * Making the card bigger than it starts.
 *
 * The card opens at its default size, which is also the least it can be: this
 * only ever grows it, up to the viewport less the island's own margin. The
 * size is two custom properties set with `setProperty`, never a rule, and the
 * viewer's last size is the controller's, remembered per origin with the other
 * preferences. The card is pinned to its corner, so a handle
 * sits on the sides facing away from it and dragging towards the page grows it.
 */

import { useMaple, useMapleClient } from "@maple-kit/react";
import { createElement, useEffect, useRef } from "react";

import { RESIZE_COPY } from "./language.js";

import type { Corner } from "@maple-kit/core/client";
import type { KeyboardEvent, PointerEvent, ReactElement, RefObject } from "react";

/** The card's default width, which is its least. */
export const CARD_WIDTH_PX = 320;

/** The card's default height is whatever its rows need; this is the least of it. */
export const CARD_MIN_HEIGHT_PX = 330;

/** The island's margin from the viewport, which the card may not grow past. */
export const CARD_MARGIN_PX = 12;

/** What an arrow key moves by, and a shifted one. */
export const STEP_PX = 16;
export const BIG_STEP_PX = 64;

/** Never fewer than this of the viewport's height, for a short window. */
const MIN_HEIGHT_SHARE = 0.62;

const WIDTH_PROPERTY = "--mk-card-w";
const HEIGHT_PROPERTY = "--mk-card-h";
const SIZED_ATTRIBUTE = "data-mk-sized";

/** A size in pixels. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** The two bounds a size is held between, for one viewport. */
export function boundsFor(viewport: Size): { readonly min: Size; readonly max: Size } {
  const max = {
    width: Math.max(0, viewport.width - CARD_MARGIN_PX * 2),
    height: Math.max(0, viewport.height - CARD_MARGIN_PX * 2),
  };
  return {
    max,
    min: {
      width: Math.min(CARD_WIDTH_PX, max.width),
      height: Math.min(CARD_MIN_HEIGHT_PX, Math.round(viewport.height * MIN_HEIGHT_SHARE)),
    },
  };
}

/** A size brought inside the bounds, whole pixels. */
export function clampSize(size: Size, viewport: Size): Size {
  const { min, max } = boundsFor(viewport);
  return {
    width: Math.round(Math.min(Math.max(size.width, min.width), max.width)),
    height: Math.round(Math.min(Math.max(size.height, min.height), max.height)),
  };
}

/** Which way a pointer moving towards the page grows the card, per axis. */
export function growth(corner: Corner): { readonly x: 1 | -1; readonly y: 1 | -1 } {
  return { x: corner.endsWith("right") ? -1 : 1, y: corner.startsWith("bottom") ? -1 : 1 };
}

/** Which handle: a side, or the corner between them. */
export type Handle = "width" | "height" | "both";

/** Where a pointer or a key left a card that started at `from`. */
export function resized(
  from: Size,
  by: { readonly dx: number; readonly dy: number },
  handle: Handle,
  corner: Corner,
): Size {
  const way = growth(corner);
  return {
    width: handle === "height" ? from.width : from.width + by.dx * way.x,
    height: handle === "width" ? from.height : from.height + by.dy * way.y,
  };
}

/** The arrow key's pull on a handle, in the direction the card would move. */
export function keyDelta(key: string, step: number): { dx: number; dy: number } | undefined {
  if (key === "ArrowLeft") return { dx: -step, dy: 0 };
  if (key === "ArrowRight") return { dx: step, dy: 0 };
  if (key === "ArrowUp") return { dx: 0, dy: -step };
  return key === "ArrowDown" ? { dx: 0, dy: step } : undefined;
}

function viewportOf(node: Element): Size {
  const root = node.ownerDocument.documentElement;
  return { width: root.clientWidth, height: root.clientHeight };
}

/** Puts a size on the card. Everything else follows from the two properties. */
function apply(card: HTMLElement, size: Size): void {
  card.style.setProperty(WIDTH_PROPERTY, `${String(size.width)}px`);
  card.style.setProperty(HEIGHT_PROPERTY, `${String(size.height)}px`);
  card.setAttribute(SIZED_ATTRIBUTE, "true");
}

function reset(card: HTMLElement): void {
  card.style.removeProperty(WIDTH_PROPERTY);
  card.style.removeProperty(HEIGHT_PROPERTY);
  card.removeAttribute(SIZED_ATTRIBUTE);
}

/**
 * Puts the viewer's size onto a card that has just mounted or been resized,
 * and follows the window: a size made for a big screen is held inside a
 * small one. No size at all is the default, which is no properties.
 */
export function useRestoredSize(card: RefObject<HTMLElement | null>, closed: boolean): void {
  const { islandSize } = useMaple();

  useEffect(() => {
    const node = card.current;
    const view = node?.ownerDocument.defaultView;
    if (!node || !view) return;
    if (!islandSize) return reset(node);

    const fit = () => apply(node, clampSize(islandSize, viewportOf(node)));
    fit();
    view.addEventListener("resize", fit);
    return () => view.removeEventListener("resize", fit);
  }, [card, closed, islandSize]);
}

/** What the handles need to know about the card they resize. */
export interface ResizeProps {
  readonly card: RefObject<HTMLElement | null>;
  readonly corner: Corner;
}

interface Drag {
  readonly x: number;
  readonly y: number;
  readonly from: Size;
}

/** Sets the card to a size inside the bounds, and hands back what it came to. */
function commit(node: HTMLElement, size: Size): Size {
  const next = clampSize(size, viewportOf(node));
  apply(node, next);
  return next;
}

/** Layout size, not the painted one: the card is scaled while it animates in. */
function sizeOf(node: HTMLElement): Size {
  return { width: node.offsetWidth, height: node.offsetHeight };
}

/** One handle: a separator the pointer drags and the arrow keys nudge. */
function ResizeHandle(props: ResizeProps & { readonly handle: Handle }): ReactElement {
  const { card, corner, handle } = props;
  const drag = useRef<Drag | undefined>(undefined);
  const client = useMapleClient();

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    const node = card.current;
    if (!node) return;
    drag.current = { x: event.clientX, y: event.clientY, from: sizeOf(node) };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      return;
    }
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const node = card.current;
    const start = drag.current;
    if (!node || !start) return;
    const by = { dx: event.clientX - start.x, dy: event.clientY - start.y };
    commit(node, resized(start.from, by, handle, corner));
  };
  const onPointerUp = () => {
    const node = card.current;
    if (node && drag.current) client.setIslandSize(sizeOf(node));
    drag.current = undefined;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const node = card.current;
    if (!node) return;
    if (event.key === "Home") {
      reset(node);
      client.setIslandSize(null);
      return event.preventDefault();
    }
    const by = keyDelta(event.key, event.shiftKey ? BIG_STEP_PX : STEP_PX);
    if (!by) return;
    event.preventDefault();
    client.setIslandSize(commit(node, resized(sizeOf(node), by, handle, corner)));
  };

  const separator = handle !== "both";
  return createElement("div", {
    className: "mk-resize",
    "data-mk-resize": handle,
    ...(separator
      ? {
          role: "separator",
          tabIndex: 0,
          "aria-orientation": handle === "width" ? "vertical" : "horizontal",
          "aria-label": handle === "width" ? RESIZE_COPY.width : RESIZE_COPY.height,
        }
      : { "aria-hidden": true }),
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onKeyDown,
  });
}

/** The three handles: the two sides facing the page, and the corner between. */
export function resizeHandles(props: ResizeProps): readonly ReactElement[] {
  return (["width", "height", "both"] as const).map((handle) =>
    createElement(ResizeHandle, { ...props, handle, key: handle }),
  );
}
