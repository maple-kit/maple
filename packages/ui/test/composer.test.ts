import { describe, expect, it } from "vitest";

import { composerCss } from "../src/composer/css.js";
import { createLeaveAsk } from "../src/composer/leave.js";
import { peeks } from "../src/composer/peek.js";
import {
  KIND_WORDS,
  leaveMessage,
  targetName,
  targetPhrase,
  UNNAMED_TARGET,
} from "../src/composer/phrase.js";
import { ruleCss, SCHEME_ATTRIBUTE } from "../src/stylesheet.js";
import { SHEET_BREAKPOINT_PX } from "../src/tokens.js";

import type { Anchor } from "@maple-kit/core/anchor";
import type { ComposerTarget, PickKind } from "@maple-kit/core/client";

const CSS = composerCss();

const ANCHOR: Anchor = { rungs: {} } as Anchor;

function target(kind: PickKind, label?: string): ComposerTarget {
  return { kind, anchor: ANCHOR, ...(label === undefined ? {} : { label }) };
}

/**
 * The name comes from `labelFor`; only the sentence around it is decided here.
 * A passage and a region are named by what holds them, never by themselves.
 */
describe("what the composer says a comment is on", () => {
  it.each([
    ["element", "the Yield card", "the Yield card"],
    ["text", "the retention paragraph", "a passage in the retention paragraph"],
    ["region", "the settings panel", "an area of the settings panel"],
  ] as const)("phrases a %s pick", (kind, name, expected) => {
    expect(targetPhrase(kind, name)).toBe(expected);
  });

  it.each([
    ["element", "this page"],
    ["text", "a passage in this page"],
    ["region", "an area of this page"],
  ] as const)("falls back to the page for an unnamed %s pick", (kind, expected) => {
    expect(targetPhrase(kind, targetName(target(kind)))).toBe(expected);
  });

  it("prefers the label the controller already resolved", () => {
    expect(targetName(target("element", "the Yield card"))).toBe("the Yield card");
  });

  it("calls a text pick a passage, because nobody says text", () => {
    expect(KIND_WORDS).toEqual({ element: "element", region: "region", text: "passage" });
  });
});

/** "Are you sure?" asks a question only the person asking can answer. */
describe("the leave prompt's copy", () => {
  it("names what is at stake", () => {
    expect(leaveMessage({ id: "d1", label: "the Yield card" })).toBe(
      "You have an unsent comment on the Yield card.",
    );
  });

  it("still says where, when nothing names the target", () => {
    expect(leaveMessage({ id: "d1" })).toContain(UNNAMED_TARGET);
  });

  it("never asks whether anyone is sure", () => {
    expect(leaveMessage({ id: "d1" }).toLowerCase()).not.toContain("are you sure");
  });
});

/** The prompt answers once, and a second question while one is open never stacks. */
describe("the leave prompt's answering", () => {
  it("resolves with what the reviewer picked", async () => {
    const ask = createLeaveAsk();
    const answered = ask.askToLeave(question());

    expect(ask.pending()).toBeDefined();
    ask.answer("discard");
    await expect(answered).resolves.toBe("discard");
    expect(ask.pending()).toBeUndefined();
  });

  it("keeps a second navigation rather than stacking two dialogs", async () => {
    const ask = createLeaveAsk();
    const first = ask.askToLeave(question());

    await expect(ask.askToLeave(question())).resolves.toBe("keep");
    ask.answer("keep");
    await expect(first).resolves.toBe("keep");
  });

  it("does nothing on a second answer", () => {
    const ask = createLeaveAsk();
    void ask.askToLeave(question());
    ask.answer("keep");
    expect(() => ask.answer("discard")).not.toThrow();
  });
});

function question() {
  return { reason: "anchor", subject: { id: "d1" }, href: "https://example.test/next" } as const;
}

function hostNode(tagName: string, takesSpace: boolean) {
  return { tagName, matches: () => takesSpace };
}

/**
 * A bare key has to check its modifiers and where it landed. Space in a
 * textarea is a space; the panel only gets out of the way for a bare one.
 */
describe("hold-to-peek's guard", () => {
  it.each([
    ["a bare space", { code: "Space", key: " " }, true],
    ["ctrl held", { code: "Space", key: " ", ctrlKey: true }, false],
    ["meta held", { code: "Space", key: " ", metaKey: true }, false],
    ["alt held", { code: "Space", key: " ", altKey: true }, false],
    ["shift held", { code: "Space", key: " ", shiftKey: true }, false],
    ["another key", { code: "KeyC", key: "c" }, false],
    ["a textarea", { code: "Space", key: " ", target: { tagName: "TEXTAREA" } }, false],
    ["an input", { code: "Space", key: " ", target: { tagName: "INPUT" } }, false],
    ["a contenteditable", { code: "Space", key: " ", target: { isContentEditable: true } }, false],
    [
      "a textarea the shadow root retargeted to its host",
      {
        code: "Space",
        key: " ",
        target: { tagName: "DIV" },
        composedPath: () => [{ tagName: "TEXTAREA" }, { tagName: "DIV" }],
      },
      false,
    ],
    ["a host button", { code: "Space", key: " ", target: hostNode("BUTTON", true) }, false],
    ["a host link", { code: "Space", key: " ", target: hostNode("A", true) }, false],
    [
      "a host div that is no control",
      { code: "Space", key: " ", target: hostNode("DIV", false) },
      true,
    ],
    [
      "a bare space outside the overlay, with a path",
      {
        code: "Space",
        key: " ",
        target: { tagName: "BODY" },
        composedPath: () => [{ tagName: "BODY" }],
      },
      true,
    ],
  ])("answers %s with %j", (_what, event, expected) => {
    expect(peeks(event)).toBe(expected);
  });
});

/**
 * The sheet is the panel, not a variant of it: the only thing that decides
 * which one a reviewer gets is the width of their screen.
 */
describe("the composer's rules", () => {
  it("takes its width and radius from the tokens the media query redeclares", () => {
    expect(CSS).toContain("width: var(--mk-composer-w)");
    expect(CSS).toContain("border-radius: var(--mk-composer-r)");
  });

  it("becomes a sheet at the breakpoint and nowhere else", () => {
    expect(CSS).toContain(`@media (max-width: ${SHEET_BREAKPOINT_PX - 1}px)`);
    expect(CSS).not.toMatch(/data-variant|\[data-mk-sheet/);
  });

  it("names the overlay's own scheme attribute for the dark inset highlight", () => {
    expect(CSS).toContain(`:host([${SCHEME_ATTRIBUTE}="dark"]) .mk-composer`);
  });

  it("gives the close a shorter duration than the open, and never bounces it", () => {
    expect(CSS).toContain("var(--mk-dur-composer-close) var(--mk-ease-surface)");
    expect(CSS).toContain("var(--mk-dur-composer-open) var(--mk-ease-surface)");
    expect(CSS).not.toContain("--mk-ease-entrance");
  });

  it("puts will-change on the panel only while it is moving", () => {
    expect(CSS).toMatch(/\[data-mk-moving="true"\] \{\s+will-change: transform, opacity;/);
  });

  it("presses at the one scale, spelled once, in the sheet every part shares", () => {
    expect(ruleCss()).toContain("transform: scale(var(--mk-press))");
    expect(CSS).not.toContain("scale(var(--mk-press))");
  });
});
