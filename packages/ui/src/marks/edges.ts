/**
 * Where the comments the page has scrolled away are, and the way back to them.
 *
 * A mark is pinned to what it is on, so one whose anchor leaves the viewport
 * leaves with it. What stays is one indicator per edge — the logo, an arrow
 * and a count — clamped to that edge at the height or the column of the
 * nearest hidden comment. Clicking it scrolls that comment into view.
 */

import { createElement, forwardRef } from "react";

import { edgeLabel } from "./label.js";
import { LEAF_ROTATION, LEAF_SOLID, LEAF_VIEW_BOX } from "./leaf.js";
import { flag, OFF_ATTRIBUTE, place } from "./paint.js";

import type { Box, Edge, Viewport } from "./geometry.js";
import type { ReactElement } from "react";

/** The four edges, in the order they are drawn. */
export const EDGES: readonly Edge[] = ["up", "down", "left", "right"];

/** The indicator's box, and how far it keeps from the viewport's own edge. */
export const EDGE_WIDTH_PX = 54;
export const EDGE_HEIGHT_PX = 30;
export const EDGE_GAP_PX = 8;

/** One mark that is off the page, and where it was meant to be. */
export interface Hidden {
  readonly id: string;
  readonly edge: Edge;
  readonly box: Box;
}

/** What one edge says: how many, and which one a click goes to. */
export interface EdgeSummary {
  readonly count: number;
  readonly nearest: string;
  /** The nearest one's coordinate along the edge, which the indicator sits at. */
  readonly along: number;
}

/** How far a hidden box is from coming back, along the axis it left by. */
function distance(hidden: Hidden, viewport: Viewport): number {
  const { box } = hidden;
  switch (hidden.edge) {
    case "up":
      return -(box.y + box.height);
    case "down":
      return box.y - viewport.height;
    case "left":
      return -(box.x + box.width);
    default:
      return box.x - viewport.width;
  }
}

/** The one coordinate that places an indicator along its edge. */
function alongOf(hidden: Hidden): number {
  const { box } = hidden;
  return hidden.edge === "up" || hidden.edge === "down"
    ? box.x + box.width / 2
    : box.y + box.height / 2;
}

/** Counts the hidden marks per edge and picks the nearest of each. */
export function summarise(
  hidden: readonly Hidden[],
  viewport: Viewport,
): Partial<Record<Edge, EdgeSummary>> {
  const found: Partial<Record<Edge, { summary: EdgeSummary; gap: number }>> = {};
  for (const one of hidden) {
    const gap = distance(one, viewport);
    const held = found[one.edge];
    const nearer = held === undefined || gap < held.gap;
    found[one.edge] = {
      gap: nearer ? gap : held.gap,
      summary: {
        count: (held?.summary.count ?? 0) + 1,
        nearest: nearer ? one.id : (held?.summary.nearest ?? one.id),
        along: nearer ? alongOf(one) : (held?.summary.along ?? 0),
      },
    };
  }
  return Object.fromEntries(Object.entries(found).map(([edge, held]) => [edge, held.summary]));
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

/** The box an edge's indicator is drawn in, against the viewport it is clamped to. */
export function edgeSpot(edge: Edge, along: number, viewport: Viewport): Box {
  const width = EDGE_WIDTH_PX;
  const height = EDGE_HEIGHT_PX;
  const farX = viewport.width - width - EDGE_GAP_PX;
  const farY = viewport.height - height - EDGE_GAP_PX;
  const alongX = clamp(along - width / 2, EDGE_GAP_PX, farX);
  const alongY = clamp(along - height / 2, EDGE_GAP_PX, farY);

  const at = {
    up: { x: alongX, y: EDGE_GAP_PX },
    down: { x: alongX, y: farY },
    left: { x: EDGE_GAP_PX, y: alongY },
    right: { x: farX, y: alongY },
  }[edge];
  return { x: Math.round(at.x), y: Math.round(at.y), width, height };
}

/** The four indicator nodes, once they are mounted. */
export type EdgeNodes = Partial<Record<Edge, HTMLButtonElement>>;

/** Moves each indicator to its edge, or hides it when nothing is off that way. */
export function paintEdges(
  nodes: EdgeNodes,
  summary: Partial<Record<Edge, EdgeSummary>>,
  viewport: Viewport,
): void {
  for (const edge of EDGES) {
    const node = nodes[edge];
    if (!node) continue;
    const said = summary[edge];
    flag(node, OFF_ATTRIBUTE, said === undefined);
    if (said) paintOne(node, edge, said, viewport);
  }
}

function paintOne(
  node: HTMLButtonElement,
  edge: Edge,
  said: EdgeSummary,
  viewport: Viewport,
): void {
  place(node, edgeSpot(edge, said.along, viewport));
  const shown = said.count > 1 ? String(said.count) : "";
  const count = node.querySelector(".mk-edge-n");
  if (count && count.textContent !== shown) count.textContent = shown;
  const label = edgeLabel(edge, said.count);
  if (node.getAttribute("aria-label") !== label) node.setAttribute("aria-label", label);
}

/** What the layer hands each indicator. */
export interface EdgeProps {
  readonly edge: Edge;
  readonly onClick: () => void;
}

/** One indicator. Hidden until the layer finds something off its edge. */
export const MapleEdge = /** @__PURE__ */ forwardRef<HTMLButtonElement, EdgeProps>(
  function MapleEdge(props, ref): ReactElement {
    return createElement(
      "button",
      {
        type: "button",
        className: "mk-edge",
        "data-mk-edge": props.edge,
        "data-mk-off": "",
        "aria-label": edgeLabel(props.edge, 1),
        onClick: props.onClick,
        ref,
      },
      createElement(
        "svg",
        {
          key: "logo",
          className: "mk-edge-logo",
          "aria-hidden": true,
          focusable: false,
          width: 15,
          height: 15,
          viewBox: LEAF_VIEW_BOX,
        },
        createElement("g", { transform: LEAF_ROTATION }, createElement("path", { d: LEAF_SOLID })),
      ),
      createElement(
        "svg",
        {
          key: "arrow",
          className: "mk-edge-arrow",
          "aria-hidden": true,
          focusable: false,
          width: 12,
          height: 12,
          viewBox: "0 0 12 12",
        },
        createElement("path", {
          d: "M6 10V2M2.5 5.5 6 2l3.5 3.5",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.7,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }),
      ),
      createElement("span", { key: "n", className: "mk-edge-n mk-num" }),
    );
  },
);
