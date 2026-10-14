import { describe, expect, it } from "vitest";

import { TAP_IDLE, tapStep } from "../src/client/index.js";

import type { TapInput, TapModifier } from "../src/client/index.js";

/** Feeds a script through the machine and counts closes and comment taps. */
function run(modifier: TapModifier, script: readonly TapInput[]) {
  let state = TAP_IDLE;
  const count = { closes: 0, taps: 0 };
  for (const input of script) {
    const step = tapStep(state, input, modifier);
    state = step.state;
    if (step.close) count.closes += 1;
    if (step.fire) count.taps += 1;
  }
  return count;
}

const key = (type: "keydown" | "keyup", name: string, at: number, extra: Partial<TapInput> = {}) =>
  ({ type, key: name, at, ...extra }) satisfies TapInput;

const cmdDown = (at: number, extra: Partial<TapInput> = {}) =>
  key("keydown", "Meta", at, { metaKey: true, ...extra });
const cmdUp = (at: number, extra: Partial<TapInput> = {}) => key("keyup", "Meta", at, extra);
const shiftDown = (at: number, extra: Partial<TapInput> = {}) =>
  key("keydown", "Shift", at, { shiftKey: true, ...extra });
const shiftUp = (at: number) => key("keyup", "Shift", at);
const altDown = (at: number, extra: Partial<TapInput> = {}) =>
  key("keydown", "Alt", at, { altKey: true, ...extra });
const altUp = (at: number) => key("keyup", "Alt", at);
const other = (at: number, name: string) => key("keydown", name, at, { metaKey: true });

describe("a tap of Shift and the comment modifier", () => {
  const cases: Array<[string, TapModifier, readonly TapInput[], number]> = [
    [
      "Shift then Cmd fires",
      "Meta",
      [shiftDown(0), cmdDown(20, { shiftKey: true }), cmdUp(80, { shiftKey: true }), shiftUp(90)],
      1,
    ],
    [
      "Cmd then Shift fires",
      "Meta",
      [cmdDown(0), shiftDown(20, { metaKey: true }), shiftUp(80), cmdUp(90)],
      1,
    ],
    [
      "released in the order pressed fires",
      "Meta",
      [shiftDown(0), cmdDown(20), shiftUp(80), cmdUp(90)],
      1,
    ],
    [
      "Shift+Alt fires off a Mac",
      "Alt",
      [shiftDown(0), altDown(20, { shiftKey: true }), altUp(80), shiftUp(90)],
      1,
    ],
    [
      "Shift+AltGraph is not a close",
      "Alt",
      [
        shiftDown(0),
        key("keydown", "AltGraph", 20, { ctrlKey: true, altKey: true, shiftKey: true }),
        key("keyup", "AltGraph", 80),
        shiftUp(90),
      ],
      0,
    ],
    [
      "Shift+Ctrl is not a close off a Mac",
      "Alt",
      [
        shiftDown(0),
        key("keydown", "Control", 20, { ctrlKey: true, shiftKey: true }),
        key("keyup", "Control", 80),
        shiftUp(90),
      ],
      0,
    ],
    [
      "Cmd+Shift+4 is a screenshot",
      "Meta",
      [cmdDown(0), shiftDown(10), other(20, "4"), shiftUp(80), cmdUp(90)],
      0,
    ],
    [
      "a third key before Shift spoils it too",
      "Meta",
      [cmdDown(0), other(10, "4"), shiftDown(20), shiftUp(80), cmdUp(90)],
      0,
    ],
    ["Shift alone does nothing", "Meta", [shiftDown(0), shiftUp(80)], 0],
    ["Cmd alone is not a close", "Meta", [cmdDown(0), cmdUp(80)], 0],
    ["a long hold is not a tap", "Meta", [shiftDown(0), cmdDown(20), shiftUp(600), cmdUp(610)], 0],
    [
      "Alt held spoils it",
      "Meta",
      [shiftDown(0, { altKey: true }), cmdDown(20), shiftUp(80), cmdUp(90)],
      0,
    ],
    [
      "a pointer press spoils it",
      "Meta",
      [shiftDown(0), cmdDown(10), { type: "pointerdown", at: 20 }, cmdUp(80), shiftUp(90)],
      0,
    ],
    [
      "a blur forgets it",
      "Meta",
      [shiftDown(0), cmdDown(10), { type: "blur", at: 20 }, cmdUp(80), shiftUp(90)],
      0,
    ],
    ["Cmd is ignored on a non-Mac", "Alt", [shiftDown(0), cmdDown(20), cmdUp(80), shiftUp(90)], 0],
    [
      "works from a text field",
      "Meta",
      [
        shiftDown(0, { editable: true }),
        cmdDown(10, { editable: true }),
        cmdUp(80, { editable: true }),
        shiftUp(90),
      ],
      1,
    ],
    [
      "fires again on a second tap",
      "Meta",
      [
        shiftDown(0),
        cmdDown(10),
        cmdUp(60),
        shiftUp(70),
        shiftDown(200),
        cmdDown(210),
        cmdUp(260),
        shiftUp(270),
      ],
      2,
    ],
  ];

  it.each(cases)("%s", (_name, modifier, script, closes) => {
    expect(run(modifier, script).closes).toBe(closes);
  });

  it("never also starts a comment", () => {
    const held = { shiftKey: true };
    const shiftFirst = [shiftDown(0), cmdDown(20, held), cmdUp(80, held), shiftUp(90)];
    const cmdFirst = [cmdDown(0), shiftDown(20, { metaKey: true }), shiftUp(80), cmdUp(90)];
    expect(run("Meta", shiftFirst).taps).toBe(0);
    expect(run("Meta", cmdFirst).taps).toBe(0);
  });

  it("leaves the plain tap exactly as it was", () => {
    expect(run("Meta", [cmdDown(0), cmdUp(80)])).toEqual({ closes: 0, taps: 1 });
  });
});
