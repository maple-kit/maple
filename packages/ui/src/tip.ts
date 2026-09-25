/**
 * A chip that carries a fact, and a tooltip that carries the sentence.
 *
 * A popover, so it is in the top layer. The first build was an absolutely
 * positioned child, the island's card hides its overflow, and the clipping
 * moved the layout enough to take the hover off again — a flicker. Nothing
 * but the top layer escapes an ancestor's overflow. Not Radix or shadcn:
 * those portal into `document.body`. See docs/ui-conventions.md.
 */

import { createElement, forwardRef, useCallback, useId, useRef } from "react";

import { cx } from "./cx.js";

import type { ElementType, ReactNode } from "react";

/** How far the tooltip sits off the thing it explains. */
const GAP_PX = 6;

/** Kept clear of the viewport's edges by this much when it is clamped. */
const EDGE_PX = 8;

/** Set while the tooltip sits under its chip, which is where it prefers to. */
const BELOW = "data-mk-below";

/** A chip, its sentence, and whatever the chip is drawn as. */
export interface TipProps {
  /** The sentence. Never rendered in the row itself. */
  readonly sentence: string;
  /** What the chip shows: a number, a percentage, a path. */
  readonly children?: ReactNode;
  readonly className?: string;
  /** The element the chip is drawn as. A `button` when it also does something. */
  readonly as?: ElementType;
  /**
   * How long the pointer has to rest before it opens. The default is the
   * stylesheet's intent delay; a fact nobody came looking for takes longer.
   */
  readonly delayMs?: number;
  /** Spread onto the trigger, for a chip that is also a control. */
  readonly triggerProps?: Record<string, unknown>;
}

/**
 * Reachable by keyboard as well as by pointer, because a fact only a mouse
 * can read is a fact half the reviewers do not have.
 */
export const Tip = /** @__PURE__ */ forwardRef<HTMLElement, TipProps>(function Tip(props, ref) {
  const id = useId();
  const trigger = useRef<HTMLElement | null>(null);
  const tip = useRef<HTMLElement | null>(null);
  const waiting = useRef<number>(undefined);
  const { delayMs = 0 } = props;

  const reveal = useCallback(() => {
    const node = tip.current;
    const from = trigger.current;
    if (!node || !from) return;
    open(node);
    place(node, from.getBoundingClientRect());
  }, []);

  const show = useCallback(() => {
    if (delayMs <= 0) return reveal();
    waiting.current = window.setTimeout(reveal, delayMs);
  }, [delayMs, reveal]);

  const hide = useCallback(() => {
    if (waiting.current !== undefined) window.clearTimeout(waiting.current);
    waiting.current = undefined;
    close(tip.current);
  }, []);
  const Element = props.as ?? "span";

  return createElement(
    Element,
    {
      ...props.triggerProps,
      className: cx("mk-tipped", props.className),
      tabIndex: 0,
      "aria-describedby": id,
      ref: keep(ref, trigger),
      onPointerEnter: show,
      onPointerLeave: hide,
      onFocus: show,
      onBlur: hide,
    },
    props.children,
    createElement("span", {
      id,
      popover: "manual",
      role: "tooltip",
      className: "mk-tip",
      ref: tip,
      children: props.sentence,
    }),
  );
});

/** A popover already open throws on a second `showPopover`, so it is asked first. */
function open(node: HTMLElement): void {
  if (!node.matches(":popover-open")) node.showPopover();
}

function close(node: HTMLElement | null): void {
  if (node?.matches(":popover-open") === true) node.hidePopover();
}

/**
 * Below the chip, or above it when there is no room — measured against the
 * viewport, because the top layer is positioned against the viewport and not
 * against whatever the chip happened to be inside.
 */
export function tipSpot(
  anchor: DOMRect,
  tip: { readonly width: number; readonly height: number },
  view: { readonly width: number; readonly height: number },
): { readonly x: number; readonly y: number } {
  const below = anchor.bottom + GAP_PX;
  const fits = below + tip.height <= view.height - EDGE_PX;
  const y = fits ? below : Math.max(EDGE_PX, anchor.top - GAP_PX - tip.height);

  const wanted = anchor.left + anchor.width / 2 - tip.width / 2;
  const last = view.width - EDGE_PX - tip.width;
  return { x: Math.min(Math.max(EDGE_PX, wanted), Math.max(EDGE_PX, last)), y };
}

/** A surface grows from the edge it was placed against, or it grows backwards. */
function place(node: HTMLElement, anchor: DOMRect): void {
  const box = node.getBoundingClientRect();
  const view = { width: window.innerWidth, height: window.innerHeight };
  const spot = tipSpot(anchor, box, view);

  node.toggleAttribute(BELOW, spot.y >= anchor.bottom);
  node.style.setProperty("--mk-x", `${String(Math.round(spot.x))}px`);
  node.style.setProperty("--mk-y", `${String(Math.round(spot.y))}px`);
}

/** The caller's ref and this one: the trigger has to be measured. */
function keep(ref: React.ForwardedRef<HTMLElement>, own: React.RefObject<HTMLElement | null>) {
  return (node: HTMLElement | null) => {
    own.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  };
}
