import { describe, expect, it } from "vitest";

import { tipSpot } from "../src/tip.js";

const VIEW = { width: 1000, height: 800 };

/** A rectangle in the shape `getBoundingClientRect` returns. */
function at(x: number, y: number, width = 40, height = 20): DOMRect {
  return { x, y, width, height, top: y, left: x, right: x + width, bottom: y + height } as DOMRect;
}

const TIP = { width: 200, height: 60 };

/**
 * The tooltip is in the top layer, so it is placed against the viewport and
 * not against whatever the chip was inside.
 */
describe("where a tooltip lands", () => {
  it("sits below the chip, centred on it, when there is room", () => {
    const spot = tipSpot(at(400, 100), TIP, VIEW);

    expect(spot.y).toBe(126);
    expect(spot.x).toBe(320);
  });

  it("flips above rather than going off the bottom", () => {
    const spot = tipSpot(at(400, 760), TIP, VIEW);

    expect(spot.y).toBe(694);
  });

  it("clamps to the left edge rather than hanging off it", () => {
    const spot = tipSpot(at(4, 100), TIP, VIEW);

    expect(spot.x).toBe(8);
  });

  it("clamps to the right edge rather than hanging off it", () => {
    const spot = tipSpot(at(980, 100), TIP, VIEW);

    expect(spot.x).toBe(792);
  });

  it("stays on screen even where the tooltip is wider than the viewport", () => {
    const spot = tipSpot(at(10, 100), { width: 1200, height: 60 }, VIEW);

    expect(spot.x).toBe(8);
  });

  it("keeps a flipped tooltip off the top edge too", () => {
    const spot = tipSpot(at(400, 10), { width: 200, height: 780 }, VIEW);

    expect(spot.y).toBeGreaterThanOrEqual(8);
  });
});
