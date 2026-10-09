import { describe, expect, it } from "vitest";

import { boundsFor, clampSize, growth, keyDelta, resized } from "../src/island/resize.js";

const VIEW = { width: 1280, height: 800 };

describe("the card's size", () => {
  it("never goes below the default, which is its least", () => {
    expect(clampSize({ width: 100, height: 100 }, VIEW)).toEqual({ width: 320, height: 330 });
  });

  it("never goes past the viewport less the island's margin", () => {
    expect(clampSize({ width: 9000, height: 9000 }, VIEW)).toEqual({ width: 1256, height: 776 });
  });

  it("holds a short window's least inside the window", () => {
    expect(boundsFor({ width: 300, height: 400 }).min).toEqual({ width: 276, height: 248 });
  });

  it.each([
    ["bottom-right", { x: -1, y: -1 }],
    ["bottom-left", { x: 1, y: -1 }],
    ["top-right", { x: -1, y: 1 }],
    ["top-left", { x: 1, y: 1 }],
  ] as const)("grows %s towards the page", (corner, expected) => {
    expect(growth(corner)).toEqual(expected);
  });

  it("grows only the axis the handle is on", () => {
    const from = { width: 320, height: 400 };
    const by = { dx: -50, dy: -30 };
    expect(resized(from, by, "width", "bottom-right")).toEqual({ width: 370, height: 400 });
    expect(resized(from, by, "height", "bottom-right")).toEqual({ width: 320, height: 430 });
    expect(resized(from, by, "both", "bottom-right")).toEqual({ width: 370, height: 430 });
  });

  it("reads an arrow key as a pull, and anything else as nothing", () => {
    expect(keyDelta("ArrowLeft", 16)).toEqual({ dx: -16, dy: 0 });
    expect(keyDelta("ArrowDown", 16)).toEqual({ dx: 0, dy: 16 });
    expect(keyDelta("Enter", 16)).toBeUndefined();
  });
});
