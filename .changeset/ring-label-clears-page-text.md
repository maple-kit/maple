---
"@maple-kit/ui": patch
---

The ring's label moves out of the page's own text. It is opaque, so a label
dropped into a line of the page hid the middle of the line and left both ends
showing, which read as the page having broken rather than as Maple naming
something. Developer detail is where it bit: the source line gives the label a
second row, and a gap that held one row no longer held it.

The label now takes the first of its ring's four corners that the window holds
and the page has not written in — above left, below left, above right, below
right, in that order, so the common case is the corner it has always used. The
question asked of a corner is whether a glyph is painted in it, measured from
the line boxes of the text runs there, rather than whether some element's box
reaches it: a card's own padding is somewhere a label may sit. The corner is
settled when the page is still rather than per scrolled frame, because a label
that re-decides mid-scroll flickers.

When every corner has text in it there is nowhere better to go, so the label
stays where a reader looks for it and carries a shadow, which says it is
floating over the page rather than part of it.
