/**
 * Where around its ring the label goes.
 *
 * The label is opaque, so one dropped into a line of the page's own text hides
 * the middle of the line and leaves both ends showing, which reads as the page
 * having broken rather than as Maple naming something. So each corner it could
 * take is asked whether a glyph is painted there — not whether some element's
 * box reaches it, because a card's own padding is somewhere a label may sit —
 * and the first corner with nothing painted in it wins.
 */

import type { Box } from "./geometry.js";

/** Where the label is sampled, in fractions of its own box. */
const COLUMNS = [0.04, 0.36, 0.68, 0.96] as const;
const ROWS = [0.15, 0.5, 0.85] as const;

/** One of the four corners, as the two flips that reach it. */
export interface LabelSpot {
  readonly below: boolean;
  readonly end: boolean;
}

/**
 * In the order they are tried. Above-left is where a reader looks for the name
 * of the thing under it; staying on the anchor's own edge is worth more than
 * staying above it, so the far end of the ring is tried only after both sides.
 */
export const LABEL_SPOTS: readonly LabelSpot[] = [
  { below: false, end: false },
  { below: true, end: false },
  { below: false, end: true },
  { below: true, end: true },
];

/** The ring and the label as it is currently drawn. */
export interface LabelPlacement {
  readonly ring: Box;
  /** Measured, so the size and the gaps are the ones the stylesheet gives it. */
  readonly label: Box;
  /** The corner it is measured at, which is what makes those gaps readable. */
  readonly drawn: LabelSpot;
}

/** The box the label would take at one corner, keeping the gaps it is drawn with. */
export function labelBox(at: LabelPlacement, spot: LabelSpot): Box {
  const { drawn, label, ring } = at;
  const far = ring.x + ring.width - label.width;
  const gap = drawn.below ? label.y - (ring.y + ring.height) : ring.y - (label.y + label.height);
  const edge = drawn.end ? far - label.x : label.x - ring.x;

  return {
    x: spot.end ? far - edge : ring.x + edge,
    y: spot.below ? ring.y + ring.height + gap : ring.y - gap - label.height,
    width: label.width,
    height: label.height,
  };
}

/** True when the page paints a line of its own text anywhere inside the box. */
export function pageTextIn(box: Box, overlay: Element): boolean {
  return ROWS.some((down) =>
    COLUMNS.some((along) => glyphAt(overlay, box.x + box.width * along, box.y + box.height * down)),
  );
}

/* The overlay is skipped rather than trusted to be out of the way: an armed
   pick shields the page, and a hit test stopping there would see nothing. */
function pageElementAt(overlay: Element, x: number, y: number): Element | undefined {
  return overlay.ownerDocument.elementsFromPoint(x, y).find((one) => !overlay.contains(one));
}

/* Text deeper down belongs to another element, which would be the topmost one
   if it reached the point. So only this element's own runs are measured. */
function glyphAt(overlay: Element, x: number, y: number): boolean {
  const found = pageElementAt(overlay, x, y);
  if (!found) return false;

  const line = overlay.ownerDocument.createRange();
  return [...found.childNodes].some((node) => {
    if (node.nodeType !== Node.TEXT_NODE || (node.textContent ?? "").trim() === "") return false;
    line.selectNodeContents(node);
    return [...line.getClientRects()].some((rect) => inside(rect, x, y));
  });
}

function inside(rect: DOMRect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * The first corner the window holds and the page has not written in. When
 * every corner has text in it there is nowhere better to go, so it takes the
 * first the window holds and carries a shadow to say it is floating.
 */
export function labelSpotFor(at: LabelPlacement, overlay: Element): LabelSpot {
  const view = overlay.ownerDocument.defaultView?.innerHeight ?? 0;
  const tried = LABEL_SPOTS.map((spot) => ({ spot, box: labelBox(at, spot) }));
  const held = tried.filter(({ box }) => box.y >= 0 && box.y + box.height <= view);
  const clear = held.find(({ box }) => !pageTextIn(box, overlay));

  return (clear ?? held[0] ?? tried[0]!).spot;
}
