/**
 * The leaf itself, in its four forms. A drawing, not a part.
 *
 * It takes no `asChild`: there is no element of a caller's to hand it, only a
 * shape the mark, the avatar and the island's pill all draw. The halo behind
 * it is what keeps a 15px leaf readable over a page whose background Maple
 * does not know, and is turned off wherever the leaf sits on a surface of ours.
 */

import { cloneElement, createElement, isValidElement, useState } from "react";

import { waterline } from "./geometry.js";
import { LEAF_ROTATION, LEAF_SOLID, LEAF_VIEW_BOX } from "./leaf.js";

import type { PartForm } from "../data.js";
import type { ReactElement, ReactNode } from "react";

/** Half, which is what a waterline means when nothing says otherwise. */
export const HALF = 0.5;

/** Ids only have to be unique inside one shadow root; a counter is enough. */
let sequence = 0;

/** A fresh clip id. Called once per instance, never once per render. */
export function nextClipId(): string {
  sequence += 1;
  return `mk-leaf-${sequence}`;
}

/**
 * With `asChild`, the caller's element takes the leaf and the number as its
 * own children, so a part hands `Slot` the one element it needs.
 */
export function inside(
  asChild: boolean | undefined,
  children: ReactNode,
  face: readonly ReactNode[],
): readonly ReactNode[] {
  if (!asChild) return face;
  return isValidElement(children) ? [cloneElement(children, {}, ...face)] : [children];
}

/** How one leaf is drawn. Fill says the life, the edge says the confidence. */
export interface LeafProps {
  readonly form?: PartForm;
  /** How much of the leaf the waterline leaves filled. */
  readonly fraction?: number;
  /** The halo behind it. Off wherever the leaf already sits on one of ours. */
  readonly halo?: boolean;
  /** The clip id, when a caller renders many and wants them stable. */
  readonly clipId?: string;
  readonly className?: string;
}

function tilted(key: string, child: ReactNode): ReactElement {
  return createElement("g", { key, transform: LEAF_ROTATION }, child);
}

function path(className: string, d: string): ReactElement {
  return createElement("path", { className, d });
}

/** The solid body under a horizontal waterline, clipped outside the rotation. */
function clipped(id: string, fraction: number): readonly ReactElement[] {
  return [
    createElement(
      "defs",
      { key: "defs" },
      createElement("clipPath", { id }, createElement("rect", waterline(fraction))),
    ),
    createElement(
      "g",
      { key: "fill", clipPath: `url(#${id})` },
      tilted("tilt", path("mk-leaf-body", LEAF_SOLID)),
    ),
  ];
}

function body(form: PartForm, id: string, fraction: number): readonly ReactElement[] {
  const edge = tilted("edge", path("mk-leaf-body mk-leaf-edge", LEAF_SOLID));
  if (form === "outline") return [edge];
  if (form === "partial") return [...clipped(id, fraction), edge];
  return [tilted("body", path("mk-leaf-body", LEAF_SOLID))];
}

/** One leaf, drawn in the form its comment's life is at. */
export function MapleLeaf(props: LeafProps): ReactElement {
  const { className, clipId, form = "solid", fraction = HALF, halo = true } = props;
  const [generated] = useState(nextClipId);
  const id = clipId ?? generated;

  return createElement(
    "svg",
    {
      className: className ? `mk-leaf ${className}` : "mk-leaf",
      viewBox: LEAF_VIEW_BOX,
      "aria-hidden": true,
      focusable: false,
    },
    halo ? tilted("halo", path("mk-leaf-halo", LEAF_SOLID)) : null,
    ...body(form, id, fraction),
  );
}
