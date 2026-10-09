/**
 * Where a mark goes and how big its half-fill is.
 *
 * The collision resolver steps a colliding mark sideways at most three times:
 * a fourth is further from its anchor than it is worth. Hit areas are 40px and
 * the step is wider than the visible mark, so two marks' hit areas never
 * overlap — which is half of what the resolver exists for.
 */

/** The visible mark. The hit area is larger and extended with a pseudo-element. */
export const MARK_SIZE_PX = 38;

/** The smallest a control may be to be hit reliably with a thumb. */
export const MARK_HIT_PX = 40;

/** A mark sits just outside its anchor's top-left corner. */
export const MARK_OFFSET_PX = 16;

/** Two candidates collide when both axes are inside this: one whole hit area. */
export const COLLISION_GAP_PX = MARK_HIT_PX;

/** How far a colliding mark steps sideways before trying again. */
export const COLLISION_STEP_PX = 42;

/** Three tries. A fourth lands further from the anchor than it is worth. */
export const COLLISION_MAX_TRIES = 3;

/** The clip rectangle that gives the half-filled form its horizontal waterline. */
export interface Waterline {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The view box is 78 units square and fills from its bottom edge upward. */
const BOX = 78;
const BOTTOM = 71;
const ORIGIN = -7;

/**
 * The clip sits outside the rotation, so the waterline stays horizontal on
 * screen while the leaf stays tilted. A fraction outside 0..1 is clamped.
 */
export function waterline(fraction: number): Waterline {
  const clamped = Math.min(Math.max(fraction, 0), 1);
  const height = BOX * clamped;
  return { x: ORIGIN, y: BOTTOM - height, width: BOX, height };
}

/** A box in viewport coordinates, which is what the overlay's layer is in. */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** How far outside the ring sits from what it names. */
const RING_INSET_PX = 3;

/** The overlay is `position: fixed`, so a client rect is already its geometry. */
export function ringBox(rect: Box): Box {
  return {
    x: Math.round(rect.x - RING_INSET_PX),
    y: Math.round(rect.y - RING_INSET_PX),
    width: Math.round(rect.width + RING_INSET_PX * 2),
    height: Math.round(rect.height + RING_INSET_PX * 2),
  };
}

/** One quote run, placed inside the ring rather than against the viewport. */
export function runBox(run: Box, rect: Box): Box {
  return {
    x: Math.round(run.x - rect.x + RING_INSET_PX),
    y: Math.round(run.y - rect.y + RING_INSET_PX),
    width: Math.round(run.width),
    height: Math.round(run.height),
  };
}

/** The viewport a mark is on or off of, scrollbars excluded. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/** Which way the page has to go to bring a hidden mark back. */
export type Edge = "up" | "down" | "left" | "right";

/** The page's scroll offset, which is how far the document has moved under the overlay. */
export interface Scroll {
  readonly x: number;
  readonly y: number;
}

/**
 * Which edge a box has left the viewport by, or nothing while any of it shows.
 * A box off at a corner is named for the axis it is further out on, so one
 * hidden mark is counted once.
 */
export function edgeOf(box: Box, viewport: Viewport): Edge | undefined {
  const above = -(box.y + box.height);
  const below = box.y - viewport.height;
  const before = -(box.x + box.width);
  const after = box.x - viewport.width;
  const far = Math.max(above, below, before, after);
  if (far < 0) return undefined;
  if (far === above) return "up";
  if (far === below) return "down";
  return far === before ? "left" : "right";
}

/**
 * Where a mark wants to be: just outside its anchor's top-left corner. It
 * keeps off the page's own edge rather than the viewport's, so one scrolled
 * away moves exactly as far as what it is on.
 */
export function markSpot(rect: Box, scroll: Scroll = { x: 0, y: 0 }): Box {
  return {
    x: Math.max(2 - scroll.x, Math.round(rect.x - MARK_OFFSET_PX)),
    y: Math.max(2 - scroll.y, Math.round(rect.y - MARK_OFFSET_PX)),
    width: MARK_SIZE_PX,
    height: MARK_SIZE_PX,
  };
}

function collides(spot: Box, taken: readonly Box[]): boolean {
  return taken.some(
    (other) =>
      Math.abs(other.x - spot.x) < COLLISION_GAP_PX &&
      Math.abs(other.y - spot.y) < COLLISION_GAP_PX,
  );
}

/**
 * Steps a colliding mark sideways until it clears every mark already placed.
 * It gives up after three: a fourth is further from its anchor than it is
 * worth, and a mark that has wandered names the wrong thing.
 */
export function placeMark(wanted: Box, taken: readonly Box[]): Box {
  let spot = wanted;
  for (let tries = 0; tries < COLLISION_MAX_TRIES && collides(spot, taken); tries += 1) {
    spot = { ...spot, x: spot.x + COLLISION_STEP_PX };
  }
  return spot;
}
