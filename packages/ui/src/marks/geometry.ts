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

/** How far off the top or the bottom a rect is before it stops being drawn. */
const CULL_PX = 60;

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

/** Far enough above or below the viewport that drawing it is wasted work. */
export function culled(rect: Box, viewportHeight: number): boolean {
  return rect.y + rect.height < -CULL_PX || rect.y > viewportHeight + CULL_PX;
}

/** Where a mark wants to be: just outside its anchor's top-left corner. */
export function markSpot(rect: Box): Box {
  return {
    x: Math.max(2, Math.round(rect.x - MARK_OFFSET_PX)),
    y: Math.max(2, Math.round(rect.y - MARK_OFFSET_PX)),
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
