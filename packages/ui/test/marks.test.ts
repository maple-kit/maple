import { kindOf } from "@maple-kit/core/anchor";
import { describe, expect, it } from "vitest";

import {
  addresses,
  COLLISION_GAP_PX,
  COLLISION_MAX_TRIES,
  COLLISION_STEP_PX,
  culled,
  initialsOf,
  kindPhrase,
  LABEL_SPOTS,
  labelBox,
  LEAF_OUTLINE,
  LEAF_ROTATION,
  LEAF_SOLID,
  LEAF_VIEW_BOX,
  MARK_HIT_PX,
  MARK_SIZE_PX,
  markLabel,
  marksCss,
  markSpot,
  markTitle,
  NOTHING_NAMED,
  placeMark,
  ringBox,
  runBox,
  startFrameLoop,
  waterline,
} from "../src/marks/index.js";
import {
  COLOR_TOKENS,
  MOTION_TOKENS,
  RADIUS_TOKENS,
  RUNTIME_TOKENS,
  SHADOW_TOKENS,
  SIZE_TOKENS,
  TYPE_TOKENS,
} from "../src/tokens.js";

import type { Comment } from "@maple-kit/core";
import type { PickKind } from "@maple-kit/core/client";

/** True for a token the base sheet already declares on `:host`. */
function inTokens(name: string): boolean {
  return [COLOR_TOKENS, MOTION_TOKENS, RADIUS_TOKENS, SHADOW_TOKENS, SIZE_TOKENS, TYPE_TOKENS].some(
    (table) => name in table,
  );
}

describe("the leaf", () => {
  it("uses the rotated bounding box, or a 20-degree tilt clips the tips", () => {
    expect(LEAF_VIEW_BOX).toBe("-7 -7 78 78");
    expect(LEAF_ROTATION).toBe("rotate(20 32 32)");
  });

  it("gives the outline a counter, so it needs no stroke to read as a ring", () => {
    expect(LEAF_SOLID.match(/z/gi)).toHaveLength(1);
    expect(LEAF_OUTLINE.match(/z/gi)).toHaveLength(2);
  });
});

/** The clip sits outside the rotation, so the waterline stays horizontal. */
describe("the half-filled form", () => {
  it.each([
    [0.5, 39, 32],
    [0.55, 42.9, 28.1],
    [1, 78, -7],
    [0, 0, 71],
  ])("clips %d of the leaf", (fraction, height, top) => {
    const rect = waterline(fraction);
    expect(rect.height).toBeCloseTo(height, 5);
    expect(rect.y).toBeCloseTo(top, 5);
    expect(rect.x).toBe(-7);
    expect(rect.width).toBe(78);
  });

  it("clamps a fraction outside the leaf rather than drawing past it", () => {
    expect(waterline(2)).toEqual(waterline(1));
    expect(waterline(-1)).toEqual(waterline(0));
  });
});

describe("the collision resolver's numbers", () => {
  it("steps further than it tests, so two hit areas never overlap", () => {
    expect(COLLISION_STEP_PX).toBeGreaterThan(COLLISION_GAP_PX);
  });

  it("gives up after three, because a fourth is further than it is worth", () => {
    expect(COLLISION_MAX_TRIES).toBe(3);
  });

  it("hits larger than it draws", () => {
    expect(MARK_HIT_PX).toBeGreaterThanOrEqual(40);
    expect(MARK_HIT_PX).toBeGreaterThan(MARK_SIZE_PX);
  });
});

describe("the collision resolver", () => {
  it("leaves a mark where it wants to be when nothing is in the way", () => {
    expect(placeMark({ x: 100, y: 100, width: 34, height: 34 }, [])).toEqual({
      x: 100,
      y: 100,
      width: 34,
      height: 34,
    });
  });

  it.each([
    ["one neighbour", 1],
    ["two neighbours", 2],
    ["three neighbours", 3],
  ])("steps sideways past %s", (_what, count) => {
    const taken = Array.from({ length: count }, (_, index) => ({
      x: 100 + index * COLLISION_STEP_PX,
      y: 100,
      width: 34,
      height: 34,
    }));

    const spot = placeMark({ x: 100, y: 100, width: 34, height: 34 }, taken);
    expect(spot.x).toBe(100 + count * COLLISION_STEP_PX);
    expect(spot.y).toBe(100);
  });

  it("clears every hit area it stepped past by a whole hit area", () => {
    const taken = [{ x: 100, y: 100, width: 34, height: 34 }];
    const spot = placeMark({ x: 110, y: 104, width: 34, height: 34 }, taken);

    expect(Math.abs(spot.x - 100)).toBeGreaterThanOrEqual(MARK_HIT_PX);
  });

  it("ignores a neighbour a row away, which no hit area reaches", () => {
    const taken = [{ x: 100, y: 100 + MARK_HIT_PX, width: 34, height: 34 }];
    expect(placeMark({ x: 100, y: 100, width: 34, height: 34 }, taken).x).toBe(100);
  });

  it("gives up rather than walking a mark away from what it names", () => {
    const wall = Array.from({ length: 9 }, (_, index) => ({
      x: 100 + index * COLLISION_STEP_PX,
      y: 100,
      width: 34,
      height: 34,
    }));

    const spot = placeMark({ x: 100, y: 100, width: 34, height: 34 }, wall);
    expect(spot.x).toBe(100 + COLLISION_MAX_TRIES * COLLISION_STEP_PX);
  });
});

describe("where a mark and a ring go", () => {
  it("stands a mark just outside the anchor's top-left corner", () => {
    expect(markSpot({ x: 220, y: 140, width: 300, height: 90 })).toMatchObject({ x: 204, y: 124 });
  });

  it("keeps a mark on the page when its anchor is at the very top", () => {
    expect(markSpot({ x: 0, y: 0, width: 10, height: 10 })).toMatchObject({ x: 2, y: 2 });
  });

  it("sits the ring three pixels outside what it names", () => {
    expect(ringBox({ x: 10, y: 20, width: 100, height: 40 })).toEqual({
      x: 7,
      y: 17,
      width: 106,
      height: 46,
    });
  });

  it("places a quote run inside the ring rather than against the viewport", () => {
    const rect = { x: 10, y: 20, width: 100, height: 40 };
    expect(runBox({ x: 30, y: 24, width: 50, height: 16 }, rect)).toEqual({
      x: 23,
      y: 7,
      width: 50,
      height: 16,
    });
  });

  const RING = { x: 117, y: 297, width: 306, height: 96 };
  const CORNERS = [
    { x: 115, y: 277, width: 90, height: 17 },
    { x: 115, y: 396, width: 90, height: 17 },
    { x: 335, y: 277, width: 90, height: 17 },
    { x: 335, y: 396, width: 90, height: 17 },
  ];

  /* Whichever corner it is measured at, the other three come out the same:
     the gap it keeps and its distance from the ring's edge are read back off
     the corner it is drawn at, so no number here is spelled twice. */
  it.each([
    ["above left", { below: false, end: false }, { x: 115, y: 277 }],
    ["below left", { below: true, end: false }, { x: 115, y: 396 }],
    ["above right", { below: false, end: true }, { x: 335, y: 277 }],
    ["below right", { below: true, end: true }, { x: 335, y: 396 }],
  ])("reads the label's four corners off the one it is drawn at, %s", (_where, drawn, at) => {
    const label = { ...at, width: 90, height: 17 };
    expect(LABEL_SPOTS.map((spot) => labelBox({ ring: RING, label, drawn }, spot))).toEqual(
      CORNERS,
    );
  });

  it.each([
    ["far above", { x: 0, y: -400, width: 10, height: 10 }, true],
    ["just above", { x: 0, y: -40, width: 10, height: 10 }, false],
    ["on screen", { x: 0, y: 300, width: 10, height: 10 }, false],
    ["far below", { x: 0, y: 900, width: 10, height: 10 }, true],
  ])("culls what is %s", (_where, rect, expected) => {
    expect(culled(rect, 800)).toBe(expected);
  });
});

/** The address is the same number the list and the export table show. */
describe("addresses", () => {
  const comments = ["c1", "c2", "c3"].map((id) => ({ id }) as Comment);

  it("counts from one, in the branch's own order", () => {
    expect([...addresses(comments)]).toEqual([
      ["c1", 1],
      ["c2", 2],
      ["c3", 3],
    ]);
  });
});

describe("the words", () => {
  it.each([
    ["element", "the Yield card", "the Yield card"],
    ["text", "the retention paragraph", "a passage in the retention paragraph"],
    ["region", "the settings panel", "an area of the settings panel"],
  ])("phrases a %s", (kind, human, expected) => {
    expect(kindPhrase(kind as PickKind, human)).toBe(expected);
  });

  it.each(["element", "text", "region"])("falls back to the page for a %s", (kind) => {
    expect(kindPhrase(kind as PickKind, undefined)).toBe(NOTHING_NAMED);
  });

  it("reads a passage as a passage rather than as a quote", () => {
    expect(kindOf({ quote: { exact: "churn" } })).toBe("text");
    expect(kindOf({ key: "kpi-mrr" })).toBe("element");
    expect(kindOf({ key: "kpi", region: { x: 0.1, y: 0.2, width: 0.4, height: 0.3 } })).toBe(
      "region",
    );
  });

  it("names the mark without a stray separator when nobody is known", () => {
    expect(markTitle(undefined, "open", "the Yield card")).toBe("Open · the Yield card");
    expect(markTitle("Sam", "resolved")).toBe("Sam · Resolved");
    expect(markLabel(3, "Priya", "needs_reverify")).toBe("Comment 3 by Priya, Needs re-verify");
    expect(markLabel(3, undefined, "open")).toBe("Comment 3, Open");
  });

  it("reduces a name to two initials, and never says the word guest", () => {
    expect(initialsOf("Reviewer A")).toBe("RA");
    expect(initialsOf("noor")).toBe("N");
    expect(initialsOf("Ada Blake Chen")).toBe("AB");
  });
});

/**
 * The marks' half of the sheet answers to the same rules as the base: motion
 * only through tokens, and no class that assumes anything of the host page.
 */
describe("the marks' stylesheet", () => {
  const CSS = marksCss();
  const literals = CSS.split("\n").map((line) => line.replace(/var\(--mk-[\w-]+\)/g, ""));

  it.each([
    ["a duration", /\b\d+m?s\b/],
    ["an easing curve", /cubic-bezier|\bease(-in|-out|-in-out)?\b|\bsteps\(/],
  ])("has no rule spelling %s", (_what, pattern) => {
    expect(literals.filter((line) => pattern.test(line))).toEqual([]);
  });

  it("never transitions all, and never transitions a position", () => {
    expect(CSS).not.toMatch(/transition:\s*all/);
    for (const [, properties] of CSS.matchAll(/transition:([^;]+);/g)) {
      expect(properties).not.toMatch(/translate|\btop\b|\bleft\b|width|height/);
    }
  });

  it("gives the ring an opacity transition and nothing else", () => {
    const ring = /\.mk-ring \{([^}]*)\}/.exec(CSS)?.[1] ?? "";
    expect(ring).toMatch(/transition: opacity var\(--mk-dur-fade\) var\(--mk-ease-surface\);/);
    expect(ring.match(/transition:/g)).toHaveLength(1);
  });

  it("wills change only while something is moving, and only what may move", () => {
    const blocks = CSS.split("}").filter((block) => block.includes("will-change"));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toContain("[data-mk-moving]");
    expect(blocks[0]).toContain("will-change: transform;");
  });

  it("assumes no host class, because none exists inside the shadow root", () => {
    const classes = [...CSS.matchAll(/\.([a-z][\w-]*)/g)].map((match) => match[1]!);
    expect(classes.filter((name) => !name.startsWith("mk-"))).toEqual([]);
  });

  it("declares every token it reads, or has it arrive through setProperty", () => {
    const declared = new Set([...CSS.matchAll(/^ *(--mk-[\w-]+):/gm)].map((match) => match[1]!));
    const read = [...CSS.matchAll(/var\((--mk-[\w-]+)/g)].map((match) => match[1]!);
    const missing = read.filter(
      (name) => !declared.has(name) && !RUNTIME_TOKENS.includes(name) && !inTokens(name),
    );
    expect(missing).toEqual([]);
  });
});

/** A window that only does what the loop asks of it, so a frame is a call. */
function fakeView() {
  const listeners = new Map<string, Set<EventListener>>();
  let pending: FrameRequestCallback[] = [];

  const view = {
    innerHeight: 800,
    requestAnimationFrame(callback: FrameRequestCallback) {
      pending.push(callback);
      return pending.length;
    },
    cancelAnimationFrame() {
      pending = [];
    },
    addEventListener(type: string, listener: EventListener) {
      const set = listeners.get(type) ?? new Set<EventListener>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type: string, listener: EventListener) {
      listeners.get(type)?.delete(listener);
    },
  };

  return {
    view: view as unknown as Window,
    fire(type: string) {
      for (const listener of listeners.get(type) ?? []) listener(new Event(type));
    },
    flush() {
      const due = pending;
      pending = [];
      for (const callback of due) callback(0);
    },
    frames: () => pending.length,
    listening: () => [...listeners].filter(([, set]) => set.size > 0).map(([type]) => type),
  };
}

/** One frame per scrolled frame, and a layer asked for only while moving. */
describe("the scroll loop", () => {
  it("coalesces a burst of scrolls into one repaint", () => {
    const painted: boolean[] = [];
    const page = fakeView();
    startFrameLoop(page.view, (moving) => painted.push(moving));

    page.fire("scroll");
    page.fire("scroll");
    page.fire("scroll");
    expect(page.frames()).toBe(1);

    page.flush();
    expect(painted).toEqual([true]);
  });

  it("stops saying it is moving once the page has settled", () => {
    const painted: boolean[] = [];
    const page = fakeView();
    startFrameLoop(page.view, (moving) => painted.push(moving));

    page.fire("scroll");
    page.flush();
    page.fire("scrollend");
    page.flush();

    expect(painted).toEqual([true, false]);
  });

  it("repaints on a resize, which moves everything without scrolling it", () => {
    const painted: boolean[] = [];
    const page = fakeView();
    startFrameLoop(page.view, (moving) => painted.push(moving));

    page.fire("resize");
    page.flush();
    expect(painted).toEqual([false]);
  });

  it("lets go of the page when the part it belongs to goes away", () => {
    const page = fakeView();
    const stop = startFrameLoop(page.view, () => undefined);
    expect(page.listening().sort((a, b) => a.localeCompare(b))).toEqual([
      "resize",
      "scroll",
      "scrollend",
    ]);

    page.fire("scroll");
    stop();

    expect(page.listening()).toEqual([]);
    expect(page.frames()).toBe(0);
  });
});
