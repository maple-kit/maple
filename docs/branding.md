# The wordmark

Maple's mark is a leaf and the word `maple`, drawn together. Both are path
data in `packages/ui/src/marks/`, and neither is a font at runtime.

## Why a path and not a webfont

The overlay renders inside a shadow root. `@font-face` is a document-level
rule and does not apply inside one, so a webfont would have to be registered
against the host application's document — a network request the host did not
ask for, a name in its font registry, and a flash of unstyled wordmark while
it loads. The word is five glyphs and never changes. It is an asset.

This is the same bargain `leaf.ts` already makes, and its header says so.

## What it is drawn from

[Caveat Brush](https://fonts.google.com/specimen/Caveat+Brush), under the SIL
Open Font License 1.1, which permits outlining glyphs into artwork. The
outlines were taken at 0.003em tracking — the tracking chosen during the
lockup trials — and the result was translated so its bounding box is the ink
box. A view box carrying whitespace cannot be centred against anything.

To regenerate after a change to the word or the tracking:

```js
// opentype.js, against the Caveat Brush TTF
const path = font.getPath("maple", 0, 0, 100, { letterSpacing: 0.003 });
const box = path.getBoundingBox(); // then translate by -box.x1, -box.y1
```

`WORDMARK_VIEW_BOX` is that box and `WORDMARK_RATIO` is its aspect, so a
caller sizing by height gets the width for free.

## In the island

![The island's header before and after, in light and dark: the leaf beside the word "Comments", and the leaf beside the word "maple".](assets/island-wordmark.png)

## The lockup

`Wordmark` in `packages/ui/src/island/wordmark.ts` is the composite, and it is
a composite rather than two parts because the two are only correct together.

- **One number sizes it.** `size` is the leaf's edge in pixels. The word is
  `WORDMARK_WORD_SCALE` (0.86) of it: at parity the leaf overpowers a
  lowercase word whose x-height is half its own box.
- **No gap.** The leaf's own tips carry the air between the two. A gap on top
  of them reads as a gap.
- **The word rides up by one part in 38 of the leaf's edge.** The leaf's mass
  sits below its box centre because the stem is the long end, so a
  box-centred word reads high beside it. This is the same correction, in the
  same direction, that `.mk-mark-n` makes for the number inside a mark. It is
  written as a percentage of the word's own height, which is 0.86 of the
  leaf's edge, so `1 / (38 * 0.86)` holds at every size.

## In the README

`docs/assets/wordmark.svg` and `wordmark-dark.svg` are the same drawing with
the token colours resolved to hex, paired in a `<picture>`. GitHub strips
inline SVG from Markdown and does not evaluate `oklch()` in a linked image, so
the two files exist rather than one that adapts.

|       | leaf                      | word                  |
| ----- | ------------------------- | --------------------- |
| light | `#465a2b` (`--mk-accent`) | `#1a1d23` (`--mk-fg`) |
| dark  | `#a6bb72` (`--mk-accent`) | `#f6f7f9` (`--mk-fg`) |

Regenerate them from the token values in `packages/ui/src/tokens.ts` whenever
those change; nothing checks that they still agree.

## On a pull request

Every body `exportMarkdown` writes is assembled in the same order: one line
saying who wrote the comments and what wrote them down, the table, a line
saying what the fence is, the fence, then a rule above the footer.

````
Comment written by Ada Lovelace via ⟨wordmark⟩:

| # | Where | Comment | Viewport |
…

The full comment details in markdown, to copy into an agent:

```maple
…
```

---

⟨preview.example.com @ a1b2c3d⟩ · powered by Maple
````

The chrome is not optional and takes no argument. A comment Maple posts is the
only place most people ever see the project, and a flag deciding whether it is
branded would be a flag nobody sets.

- **The wordmark is the same `<picture>` pair the README uses**, served from
  `raw.githubusercontent.com` on `main`, which is why moving or renaming
  `docs/assets/wordmark.svg` breaks the mark on every comment already posted.
  It is emitted on one line: a blank line inside an HTML block ends the block,
  and the rest would render as literal markup.
- **It sits in the sentence rather than above it.** A banner on its own line
  reads as a header on the reviewer's comment, which is whose comment it is
  not. In the sentence it reads as the byline it is.
- **The author line is derived, never stored.** It names each distinct
  `comment.author.name` once, in first-appearance order. A set whose authors
  are all blank says `collected via` instead, so the mark never drops out.
- **The footer stamps the preview.** The host of `context.url` and the first
  seven of `commit`, from the first comment in the set: a reviewer with three
  previews open cannot tell them apart from the table. A URL that will not
  parse costs the stamp and nothing else.
- **The fence keeps its own budget.** `bytes` and `reduced` describe the fence
  alone, so the chrome cannot push a comment into a reduction.

## The App's logo

`docs/assets/app-logo.png` is the avatar both GitHub Apps wear: the solid leaf
at 92% of a transparent square, tilted its own 20 degrees, with a lowercase
`m` in Caveat Brush cut out of it in `--mk-accent-sub` cream. Lowercase,
because the wordmark's word is lowercase and a capital reads as a different
mark; cut out rather than laid on, because at 20 pixels in a checks list the
counter is the only thing that says the leaf is a letter at all.

It is a manual upload under **Display information** — GitHub has no manifest
field for a logo and no REST endpoint for an App's avatar — so the
`setup-maple-org` skill asks for it at the step where a person is already on
that page. The badge background beside it is `#465a2b`, the light accent.

Regenerate it from `tools/logo-lab/index.html`, which draws `LEAF_SOLID` and
the letter onto a canvas at any size and previews the result down to 20
pixels. Open it, load the **Cut-out** preset, and these are the settings the
file was rendered at, at 1024:

```json
{
  "leafStyle": "solid",
  "leafColor": "#465a2b",
  "leafSize": 92,
  "leafTilt": 20,
  "mColor": "#fdf8e8",
  "mSize": 27,
  "mX": 0,
  "mY": 1,
  "mTilt": 0,
  "mCase": "m",
  "bgAlpha": 0
}
```

```

```
