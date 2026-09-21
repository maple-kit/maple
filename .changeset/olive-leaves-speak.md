---
"@maple-kit/ui": minor
---

The island's header carries the Maple wordmark instead of the word "Comments".

`Maple.Logo` now draws the new `Maple.Wordmark`: the leaf and the word `maple`
as one composite, sized by a single number. Both halves are path data — the
overlay lives in a shadow root, where `@font-face` does not apply, and a
wordmark that fetched a font would put a request on the host application's
page. `docs/branding.md` records how the outlines were taken and why the word
rides one part in 38 above the leaf's box centre.

**Breaking.** `ISLAND_COPY.title` no longer reaches the header; it stays as the
accessible name of the content region, which is what it now only means. A
composition that wants its own text there passes children to `Maple.Logo`,
which it could already do. The new `ISLAND_COPY.wordmark` is the lockup's
accessible name.
