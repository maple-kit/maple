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
    ["a held m", press({ repeat: true }), false],
    ["m during IME composition", press({ isComposing: true }), false],
    ["m with the IME keyCode 229", press({ keyCode: 229 }), false],
    ["m with an ordinary keyCode", press({ keyCode: 77 }), true],
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

describe("an editor found along the event path", () => {
  const attrs = (map: Record<string, string>) => ({
    tagName: "DIV",
    getAttribute: (name: string) => map[name] ?? null,
  });
  const plain = { tagName: "SPAN" };

  it.each([
    ["role=textbox", attrs({ role: "textbox" }), true],
    ["role=combobox", attrs({ role: "combobox" }), true],
    ["role=searchbox", attrs({ role: "searchbox" }), true],
    ["a role list starting with textbox", attrs({ role: "textbox presentation" }), true],
    ["role=button", attrs({ role: "button" }), false],
    ["contenteditable", attrs({ contenteditable: "" }), true],
    ["contenteditable=plaintext-only", attrs({ contenteditable: "plaintext-only" }), true],
    ["contenteditable=false", attrs({ contenteditable: "false" }), false],
  ])("%s as the target is typing = %s", (_name, element, typing) => {
    expect(isEditable(element)).toBe(typing);
  });

  it.each([
    ["a contenteditable ancestor", attrs({ contenteditable: "true" })],
    ["a role=textbox ancestor", attrs({ role: "textbox" })],
  ])("does not open from a child of %s", (_name, ancestor) => {
    const path = () => [plain, ancestor, { tagName: "BODY" }];
    expect(opensMock(press({ target: plain, composedPath: path }))).toBe(false);
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

  it.each([
    ["text", true],
    ["search", true],
    ["email", true],
    ["number", true],
    ["date", true],
    ["PASSWORD", true],
    ["unknown", true],
    ["checkbox", false],
    ["radio", false],
    ["button", false],
    ["submit", false],
    ["reset", false],
    ["range", false],
    ["color", false],
    ["file", false],
    ["image", false],
    ["hidden", false],
  ])("an input of type %s is typing = %s", (type, typing) => {
    expect(isEditable({ tagName: "INPUT", type })).toBe(typing);
  });

  it("reads an input's type from its attribute and defaults to text", () => {
    expect(isEditable({ tagName: "INPUT", getAttribute: () => "checkbox" })).toBe(false);
    expect(isEditable({ tagName: "INPUT" })).toBe(true);
  });

  it("counts a select and a textarea as typing", () => {
    expect(isEditable({ tagName: "SELECT" })).toBe(true);
    expect(isEditable({ tagName: "TEXTAREA" })).toBe(true);
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
    [
      "Cmd+scroll is a zoom",
      "Meta",
      [down(0), { type: "wheel", at: 20, metaKey: true }, up(80)],
      0,
    ],
    [
      "Ctrl+scroll is a zoom",
      "Control",
      [
        down(0, { key: "Control", ctrlKey: true, metaKey: false }),
        { type: "wheel", at: 20, ctrlKey: true },
        up(80, { key: "Control" }),
      ],
      0,
    ],
    ["momentum scrolling is not a chord", "Meta", [down(0), { type: "wheel", at: 20 }, up(80)], 1],
    ["a checkbox is not typing", "Meta", [down(0, { editable: false }), up(80)], 1],
    ["a lost keyup is healed by the next keydown", "Meta", [down(0), down(10000), up(10080)], 1],
    [
      "a repeat does not restart the hold",
      "Meta",
      [down(0), down(400, { repeat: true }), up(600)],
      0,
    ],
    ["a hidden page forgets the hold", "Meta", [down(0), { type: "hidden", at: 20 }, up(80)], 0],
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

describe("why a quick tap was ignored", () => {
  const reasons = (script: readonly TapInput[]): Array<string | undefined> => {
    let state = TAP_IDLE;
    return script.map((input) => {
      const step = tapStep(state, input, "Meta");
      state = step.state;
      return step.ignored;
    });
  };

  it.each([
    ["typing when it goes down", [down(0, { editable: true }), up(80)], "editable"],
    ["typing when it comes up", [down(0), up(80, { editable: true })], "editable"],
    ["a long hold in a field", [down(0, { editable: true }), up(600)], undefined],
    ["a chord in a field", [down(0, { editable: true }), other(10, "c"), up(80)], undefined],
    ["a clean tap", [down(0), up(80)], undefined],
  ] as const)("%s: %s", (_name, script, expected) => {
    expect(reasons(script).at(-1)).toBe(expected);
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
