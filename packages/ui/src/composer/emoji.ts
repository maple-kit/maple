/**
 * The small set a review comment actually uses, and the `:` that finds it.
 *
 * Not a picker over every emoji there is: a reviewer reaching for one is
 * softening a criticism or flagging a blocker, and a search over 3,600 glyphs
 * is a worse way to do either than twelve buttons. Not a rich-text editor
 * either — the body is a plain string on the wire, so Tiptap would buy a
 * document model nothing here uses, and a textarea knows its own caret.
 */

/** One glyph and the words that find it. */
export interface EmojiChoice {
  readonly glyph: string;
  /** The first is the shortcode shown; the rest are aliases that also match. */
  readonly names: readonly string[];
}

/**
 * Twelve, chosen for a review: agreement, doubt, a blocker, a nit, a thing
 * that made someone laugh, and the three that stand in for "ship it".
 */
export const REVIEW_EMOJI: readonly EmojiChoice[] = [
  { glyph: "👍", names: ["+1", "yes", "agree", "thumbsup"] },
  { glyph: "🎉", names: ["tada", "nice", "party"] },
  { glyph: "🙏", names: ["please", "thanks", "pray"] },
  { glyph: "🤔", names: ["thinking", "hmm", "unsure"] },
  { glyph: "😅", names: ["sweat", "oops", "awkward"] },
  { glyph: "🙈", names: ["hide", "yikes", "monkey"] },
  { glyph: "🐛", names: ["bug", "broken"] },
  { glyph: "🔥", names: ["fire", "hot", "great"] },
  { glyph: "⚠️", names: ["warning", "careful", "risk"] },
  { glyph: "🚀", names: ["ship", "rocket", "launch"] },
  { glyph: "✨", names: ["sparkles", "polish", "neat"] },
  { glyph: "💡", names: ["idea", "suggestion", "tip"] },
];

/** How many the shortcode menu offers at once. More is a list, not a hint. */
export const SHORTCODE_LIMIT = 6;

/** A `:word` being typed, and where in the body it starts. */
export interface Shortcode {
  readonly query: string;
  /** Index of the colon itself, so the replacement knows what to cut. */
  readonly start: number;
}

const COLON_WORD = /(?:^|\s):([a-z\d+_-]*)$/i;

/**
 * The shortcode the caret is sitting at the end of, if any. It has to follow
 * a space or the start of the body, or every URL with a colon in it opens a
 * menu halfway through being typed.
 */
export function shortcodeAt(body: string, caret: number): Shortcode | undefined {
  const before = body.slice(0, caret);
  const found = COLON_WORD.exec(before);
  if (!found) return undefined;

  const query = found[1] ?? "";
  return { query, start: caret - query.length - 1 };
}

/** The emoji a shortcode names, best prefix first, at most six. */
export function searchEmoji(query: string): readonly EmojiChoice[] {
  const needle = query.toLowerCase();
  if (needle === "") return REVIEW_EMOJI.slice(0, SHORTCODE_LIMIT);

  const starts = REVIEW_EMOJI.filter((one) => one.names.some((name) => name.startsWith(needle)));
  const rest = REVIEW_EMOJI.filter(
    (one) => !starts.includes(one) && one.names.some((name) => name.includes(needle)),
  );
  return [...starts, ...rest].slice(0, SHORTCODE_LIMIT);
}

/** A body with `glyph` written over `[start, end)`, and where the caret lands. */
export interface Written {
  readonly body: string;
  readonly caret: number;
}

/**
 * Writes the glyph over `[start, end)`, spaced on both sides. A glyph jammed
 * against the word before it is a typo, and one with nothing after it leaves
 * nowhere to keep typing.
 */
export function writeAt(body: string, start: number, end: number, glyph: string): Written {
  const head = body.slice(0, start);
  const tail = body.slice(end);
  const before = head === "" || /\s$/.test(head) ? "" : " ";
  const after = tail.startsWith(" ") ? "" : " ";

  return {
    body: `${head}${before}${glyph}${after}${tail}`,
    caret: start + before.length + glyph.length + after.length,
  };
}

/**
 * Appended, not inserted at the caret: used where the caller has no field to
 * ask, which is any composition that draws the control outside the body.
 */
export function appended(body: string, glyph: string): string {
  if (body === "") return glyph;
  return body.endsWith(" ") ? `${body}${glyph}` : `${body} ${glyph}`;
}
