import { describe, expect, it } from "vitest";

import { isEditable, opensComposer, opensMock } from "../src/client/index.js";

import type { ShortcutEvent } from "../src/client/index.js";

function press(overrides: Partial<ShortcutEvent> = {}): ShortcutEvent {
  return { key: "c", ...overrides };
}

/**
 * The trap this exists for: the first build fired on the key alone, so copying
 * a paragraph with Ctrl+C closed the composer the reviewer was writing in.
 */
describe("the c shortcut", () => {
  const cases: Array<[string, ShortcutEvent, boolean]> = [
    ["a bare c", press(), true],
    ["an uppercase C", press({ key: "C" }), true],
    ["another letter", press({ key: "v" }), false],
    ["cmd+c, which is copy", press({ metaKey: true }), false],
    ["ctrl+c, which is copy", press({ ctrlKey: true }), false],
    ["alt+c, which is a character", press({ altKey: true }), false],
    ["a key something already handled", press({ defaultPrevented: true }), false],
    ["c typed into an input", press({ target: { tagName: "INPUT" } }), false],
    ["c typed into a textarea", press({ target: { tagName: "textarea" } }), false],
    ["c typed into a rich editor", press({ target: { isContentEditable: true } }), false],
    ["c over plain text", press({ target: { tagName: "P" } }), true],
  ];

  it.each(cases)("%s: %o opens the composer = %s", (_name, event, expected) => {
    expect(opensComposer(event)).toBe(expected);
  });
});

describe("the m shortcut", () => {
  const cases: Array<[string, ShortcutEvent, boolean]> = [
    ["a bare m", press({ key: "m" }), true],
    ["an uppercase M", press({ key: "M" }), true],
    ["c, which is the composer's", press(), false],
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

  it.each([
    ["the composer", opensComposer, "c"],
    ["the mock box", opensMock, "m"],
  ])("does not open %s from a field inside one", (_name, opens, key) => {
    expect(opens(press({ key, target: host, composedPath: () => [input, host] }))).toBe(false);
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

describe("an application that chose another key", () => {
  it.each([
    ["k", { key: "k" }, true],
    ["k", { key: "K" }, true],
    ["k", { key: "c" }, false],
    ["k", { key: "k", ctrlKey: true }, false],
  ])("answers to %s and to nothing else", (key, event, expected) => {
    expect(opensComposer(event, key)).toBe(expected);
  });
});
