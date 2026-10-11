import { describe, expect, it } from "vitest";

import {
  commentModifier,
  commentTapLabel,
  isEditable,
  opensMock,
  TAP_IDLE,
  tapStep,
} from "../src/client/index.js";

import type { ShortcutEvent, TapInput, TapModifier } from "../src/client/index.js";

function press(overrides: Partial<ShortcutEvent> = {}): ShortcutEvent {
  return { key: "m", ...overrides };
}

describe("the m shortcut", () => {
  const cases: Array<[string, ShortcutEvent, boolean]> = [
    ["a bare m", press({ key: "m" }), true],
    ["an uppercase M", press({ key: "M" }), true],
    ["c, which no longer opens anything", press({ key: "c" }), false],
    ["cmd+m, which minimises the window", press({ key: "m", metaKey: true }), false],
    ["m typed into an input", press({ key: "m", target: { tagName: "INPUT" } }), false],
  ];

  it.each(cases)("%s: %o opens the mock box = %s", (_name, event, expected) => {
    expect(opensMock(event)).toBe(expected);
  });
});

/**
 * A document listener sees a key typed into a shadow root as landing on its
 * host. The host is a `div`, so the target alone says nobody is typing.
 */
describe("a key typed inside a shadow root", () => {
  const host = { tagName: "DIV" };
  const input = { tagName: "INPUT" };

  it("does not open the mock box from a field inside one", () => {
    expect(opensMock(press({ target: host, composedPath: () => [input, host] }))).toBe(false);
  });

  it("opens from plain text inside one", () => {
    const text = { tagName: "SPAN" };
    expect(opensMock(press({ key: "m", target: host, composedPath: () => [text, host] }))).toBe(
      true,
    );
  });

  it("falls back to the target when the path is empty", () => {
    expect(opensMock(press({ key: "m", target: input, composedPath: () => [] }))).toBe(false);
  });
});

describe("where a person could be typing", () => {
  it("reads contenteditable from the attribute as well as the property", () => {
    const editable = { getAttribute: (name: string) => (name === "contenteditable" ? "" : null) };
    expect(isEditable(editable)).toBe(true);
  });

  it("does not treat contenteditable=false as typing", () => {
    const plain = { getAttribute: () => "false" };
    expect(isEditable(plain)).toBe(false);
  });

  it("survives a target that is not an element at all", () => {
    expect(isEditable(null)).toBe(false);
    expect(isEditable(globalThis)).toBe(false);
  });
});

/** Feeds a script of inputs through the machine and returns every step that fired. */
function run(modifier: TapModifier, script: readonly TapInput[]): number {
  let state = TAP_IDLE;
  let fired = 0;
  for (const input of script) {
    const step = tapStep(state, input, modifier);
    state = step.state;
    if (step.fire) fired += 1;
  }
  return fired;
}

const down = (at: number, extra: Partial<TapInput> = {}): TapInput => ({
  type: "keydown",
  key: "Meta",
  metaKey: true,
  at,
  ...extra,
});
const up = (at: number, extra: Partial<TapInput> = {}): TapInput => ({
  type: "keyup",
  key: "Meta",
  at,
  ...extra,
});
const other = (at: number, key: string): TapInput => ({ type: "keydown", key, metaKey: true, at });

describe("a tap of the comment modifier", () => {
  const cases: Array<[string, TapModifier, readonly TapInput[], number]> = [
    ["a plain tap fires", "Meta", [down(0), up(80)], 1],
    ["two taps fire twice", "Meta", [down(0), up(80), down(200), up(260)], 2],
    ["Cmd+C is copy", "Meta", [down(0), other(20, "c"), up(80)], 0],
    ["Cmd+Tab is the app switcher", "Meta", [down(0), other(20, "Tab"), up(80)], 0],
    ["Cmd+click is a link opener", "Meta", [down(0), { type: "pointerdown", at: 20 }, up(80)], 0],
    ["Cmd+scroll is a zoom", "Meta", [down(0), { type: "wheel", at: 20 }, up(80)], 0],
    ["a long hold is not a tap", "Meta", [down(0), up(500)], 0],
    ["just under the limit is", "Meta", [down(0), up(499)], 1],
    ["Shift already down", "Meta", [down(0, { shiftKey: true }), up(80)], 0],
    ["Alt down before", "Meta", [down(0, { altKey: true }), up(80)], 0],
    ["Ctrl down before", "Meta", [down(0, { ctrlKey: true }), up(80)], 0],
    ["another modifier pressed during", "Meta", [down(0), other(20, "Shift"), up(80)], 0],
    ["another modifier still held on release", "Meta", [down(0), up(80, { shiftKey: true })], 0],
    ["a blur in between", "Meta", [down(0), { type: "blur", at: 20 }, up(80)], 0],
    ["typing in a field when it goes down", "Meta", [down(0, { editable: true }), up(80)], 0],
    ["typing in a field when it comes up", "Meta", [down(0), up(80, { editable: true })], 0],
    ["key repeat is not another key", "Meta", [down(0), down(30, { repeat: true }), up(80)], 1],
    ["a keyup with no keydown", "Meta", [up(80)], 0],
    [
      "the other key's keyup is ignored",
      "Meta",
      [down(0), { type: "keyup", key: "c", at: 20 }, up(80)],
      1,
    ],
    [
      "a spoiled hold does not poison the next tap",
      "Meta",
      [down(0), other(10, "c"), up(50), down(100), up(150)],
      1,
    ],
    [
      "Ctrl on a non-Mac",
      "Control",
      [down(0, { key: "Control", ctrlKey: true, metaKey: false }), up(80, { key: "Control" })],
      1,
    ],
    ["Meta is ignored on a non-Mac", "Control", [down(0), up(80)], 0],
    [
      "Ctrl is ignored on a Mac",
      "Meta",
      [down(0, { key: "Control", ctrlKey: true }), up(80, { key: "Control" })],
      0,
    ],
  ];

  it.each(cases)("%s", (_name, modifier, script, fired) => {
    expect(run(modifier, script)).toBe(fired);
  });
});

describe("which modifier a platform taps", () => {
  it.each([
    ["MacIntel", undefined, "Meta"],
    ["iPhone", undefined, "Meta"],
    ["iPad", undefined, "Meta"],
    ["Win32", undefined, "Control"],
    ["Linux x86_64", undefined, "Control"],
    ["Win32", "macOS", "Meta"],
    ["MacIntel", "Windows", "Control"],
  ])("%s with userAgentData %s taps %s", (platform, data, expected) => {
    const source = {
      platform,
      ...(data === undefined ? {} : { userAgentData: { platform: data } }),
    };
    expect(commentModifier(source)).toBe(expected);
  });

  it("says Tap Ctrl or Tap Cmd for the tooltip", () => {
    expect(commentTapLabel("Control")).toBe("Tap Ctrl");
    expect(commentTapLabel("Meta")).toBe("Tap \u2318");
  });
});
