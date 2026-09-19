import { describe, expect, it } from "vitest";

import {
  appended,
  REVIEW_EMOJI,
  searchEmoji,
  SHORTCODE_LIMIT,
  shortcodeAt,
  writeAt,
} from "../src/composer/emoji.js";

/**
 * Written at the caret, which the field owns. The spacing rule is the whole
 * of the behaviour: a glyph jammed against a word is a typo.
 */
describe("writing a glyph into a draft", () => {
  it("spaces the glyph on both sides and leaves the caret after it", () => {
    const written = writeAt("ship it", 7, 7, "🚀");

    expect(written.body).toBe("ship it 🚀 ");
    expect(written.caret).toBe(written.body.length);
  });

  it("adds no leading space where the text already ends in one", () => {
    expect(writeAt("ship it ", 8, 8, "🚀").body).toBe("ship it 🚀 ");
  });

  it("adds none at the very start either", () => {
    expect(writeAt("", 0, 0, "🚀").body).toBe("🚀 ");
  });

  it("writes over a shortcode rather than beside it", () => {
    expect(writeAt("looks :rock", 6, 11, "🚀").body).toBe("looks 🚀 ");
  });

  it("adds no second space where what follows already starts with one", () => {
    expect(writeAt("ship it  too", 8, 8, "🚀").body).toBe("ship it 🚀 too");
    expect(writeAt("ship it too", 8, 8, "🚀").body).toBe("ship it 🚀 too");
  });

  it("keeps what comes after the caret", () => {
    expect(writeAt("ab cd", 3, 3, "🐛").body).toBe("ab 🐛 cd");
  });
});

describe("appending, where the caller has no field to ask", () => {
  it("is the glyph itself when nothing has been written", () => {
    expect(appended("", "🎉")).toBe("🎉");
  });

  it("puts a space between a word and the glyph, and never two", () => {
    expect(appended("Ship it", "🚀")).toBe("Ship it 🚀");
    expect(appended("Ship it ", "🚀")).toBe("Ship it 🚀");
  });
});

/**
 * A colon has to follow a space or the start of the body, or a URL opens a
 * menu halfway through being typed.
 */
describe("the shortcode under the caret", () => {
  it("finds a colon word at the start of the body", () => {
    expect(shortcodeAt(":bu", 3)).toEqual({ query: "bu", start: 0 });
  });

  it("finds one after a space", () => {
    expect(shortcodeAt("this is :bu", 11)).toEqual({ query: "bu", start: 8 });
  });

  it("offers everything on the bare colon", () => {
    expect(shortcodeAt("ok :", 4)).toEqual({ query: "", start: 3 });
  });

  it("ignores a colon inside a word, which is most of them", () => {
    expect(shortcodeAt("https://x", 9)).toBeUndefined();
    expect(shortcodeAt("ratio 3:2", 9)).toBeUndefined();
  });

  it("ignores one the caret has already moved past", () => {
    expect(shortcodeAt("say :bug then", 13)).toBeUndefined();
  });

  it("stops at a space, because a shortcode is one word", () => {
    expect(shortcodeAt(":bug fix", 8)).toBeUndefined();
  });
});

describe("what a shortcode finds", () => {
  it("matches the name a glyph is known by", () => {
    expect(searchEmoji("bug")[0]?.glyph).toBe("🐛");
    expect(searchEmoji("rocket")[0]?.glyph).toBe("🚀");
  });

  it("matches an alias as readily as the first name", () => {
    expect(searchEmoji("+1")[0]?.glyph).toBe("👍");
    expect(searchEmoji("ship")[0]?.glyph).toBe("🚀");
  });

  it("puts what starts with the query before what merely contains it", () => {
    const found = searchEmoji("i");
    const first = found[0]?.names[0] ?? "";

    expect(first.startsWith("i")).toBe(true);
  });

  it("finds nothing for a word none of them answer to", () => {
    expect(searchEmoji("aubergine")).toEqual([]);
  });

  it("offers the default set, capped, on the bare colon", () => {
    expect(searchEmoji("")).toHaveLength(SHORTCODE_LIMIT);
  });

  it("never offers more than the menu can show", () => {
    expect(searchEmoji("e").length).toBeLessThanOrEqual(SHORTCODE_LIMIT);
  });
});

describe("the set a review actually uses", () => {
  it("is small enough to scan, with no duplicate glyph or name", () => {
    const names = REVIEW_EMOJI.flatMap((one) => one.names);

    expect(REVIEW_EMOJI.length).toBeLessThanOrEqual(12);
    expect(new Set(REVIEW_EMOJI.map((one) => one.glyph)).size).toBe(REVIEW_EMOJI.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every glyph at least one name to be found by", () => {
    for (const one of REVIEW_EMOJI) expect(one.names.length).toBeGreaterThan(0);
  });
});
