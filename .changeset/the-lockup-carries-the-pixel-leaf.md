---
"@maple-kit/ui": minor
---

**Breaking:** the wordmark's leaf is a new drawing, and the three numbers that
positioned the old one are gone.

`@maple-kit/ui/marks` exports `PIXEL_LEAF_VIEW_BOX` and `PIXEL_LEAF_SHADES`:
443 cells in 33 colours, merged into 263 rectangles, one `<path>` per colour.
It is artwork, not a token, and only `Wordmark` draws it.

What changed for a host:

- **`WORDMARK_WORD_SCALE` is 0.90**, not 0.86. The leaf it replaced was ink for
  0.82 of its box and this one for 0.93, so a word at the old scale reads short
  beside it.
- **The lockup has a gap**, 0.2 of the leaf's edge, and the word's rise is now
  both centres of mass rather than one part in 38. `Wordmark` sets both inline,
  because both are fractions of `size`.
- **`.mk-wordmark-leaf` no longer takes a colour.** The rules that painted it
  in `--mk-accent` and stroked its path are gone: the drawing paints its own
  33 fills, and anything that recolours it flattens it. A host overriding that
  class to retint the mark will find nothing to retint.
- **The comment mark is untouched.** `LEAF_SOLID`, `LEAF_OUTLINE`,
  `LEAF_VIEW_BOX` and `LEAF_ROTATION` still export from the same module, and
  `MapleLeaf` still draws all four forms, still clipped at the waterline and
  still recoloured by status.

The island column costs 1.3 KB gzipped more than it did, 24.7 KB to 26.0 KB,
and its budget in `packages/ui/scripts/size.js` moved from 26 KB to 28 KB.

`docs/branding.md` has the ramp and why it is not a second accent.
