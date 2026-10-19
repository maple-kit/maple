# Conventions in `@maple-kit/ui`

**Status:** in force. Every part in this package follows all of it, and a part
that does not is a review comment rather than a preference.

`@maple-kit/react` is headless and stops at hooks. This package is the composed
parts. Nothing here may be depended on by `@maple-kit/react`, and nothing here
re-exports it: an application rendering comments in its own design system
depends on that package and pulls in none of these.

## State goes on `data-*`, never into props

`dataAttributes(state)` in `src/data.ts` is the only place the five names are
spelled: `data-status`, `data-form`, `data-confidence`, `data-provenance`,
`data-armed`. A part spreads what it returns and writes no attribute for state
it did not claim.

Styling then belongs to whoever owns the stylesheet rather than to a prop.
There is no `variant`, no `tone` and no `size` on any part. `formFor` and
`confidenceFor` beside it turn a comment into the two values the mark reads.

## `asChild` everywhere

Every part takes `asChild` and renders `Slot` from `src/slot.ts` in place of its
own element. Handlers compose, `className` and `style` merge, and both refs are
called, so an application can hand a part its own button and keep the focus ring
and the analytics already on it. Every part also passes `className` through and
forwards a ref.

## No visual variant props

There is no `<Maple.Composer variant="sheet">`. There is `<Maple.Composer>` and
a media query at `SHEET_BREAKPOINT_PX`, because the sheet **is** the panel under
640px. The stylesheet carries that as `--mk-composer-w` and `--mk-composer-r`.

## One module per part, and no index naming them all

The exports map is granular — `.`, `./marks`, `./island`, `./composer`,
`./icons` — and each subpath is its own module graph. A single index naming
every part is how tree-shaking quietly stops working across bundler versions.
Factory calls carry `/** @__PURE__ */`, and icons are individual named exports
rather than an `ICONS` record, which is retained whole the moment anything
indexes it dynamically.

## Styling is a token contract

`src/tokens.ts` holds every `--mk-*` and `src/stylesheet.ts` builds the sheet
from it. No part writes a colour, a radius, a duration or an easing of its own;
`packages/ui/test/stylesheet.test.ts` fails if a rule spells one.

The tokens in `RUNTIME_TOKENS` are never declared and only ever arrive through
`setProperty`: `--mk-slot`, `--mk-slot-ink`, `--mk-pin` and `--mk-pin-ink` for
colour, and `--mk-x`, `--mk-y`, `--mk-w` and `--mk-h` for anything a frame
moves. A reviewer's colour is `applyReviewerSlot(element, slot)` and never a
generated rule per reviewer.

Host classes do not exist inside the shadow root. Nothing may assume Tailwind,
the application's fonts or its custom properties: the overlay declares its own
system stacks and inherits nothing, which is what keeps `font-src` untouched.

### Motion

Surface motion — open, close, slide, resize, reposition — is
`--mk-ease-surface`. Overshoot is `--mk-ease-entrance` and belongs to entrances
alone: a mark landing, a count popping. **Never bounce a close, and never delay
a close or a hover-out.** The ring and the marks are repositioned per scroll
frame and must carry no transition on their position; only opacity and first
appearance animate.

`prefers-reduced-motion` redefines the same tokens rather than switching rules
off: every duration lands at or under 100ms and distance, pre-scale and stagger
collapse to nothing, so what is left is the opacity. The motion is reduced; the
state feedback is not removed.

## One ring, and what wins it

There is exactly one `Maple.TargetRing` on the page, because two rings are two
answers to "which one is this about". What wins it, in order:

1. **A pointer.** A hovered mark or row takes the ring even while a panel is
   open, and gives it straight back on the way out. A peek sticks to nothing.
2. **The composer**, while one is open on a pick.
3. **The selection.** A click is the gesture that outlives the hand: the ring
   stays on the page after the pointer has moved away, at
   `data-mk-state="selected"`.

A panel opened on a comment is _reading_ it, so it draws `selected` rather than
`composing` — the state says why the ring is showing, not which part drew it.

Developer detail adds a second line to the ring's label: the source line, from
`sourceFor` in `@maple-kit/core/anchor`. The page wins over the anchor there,
because the anchor records where the element was when the comment was written.

## Surfaces stand beside each other, never on top

The composer panel and the island are both surfaces, and neither is a layer
over the other. When the panel opens, the island steps aside by
`--mk-composer-w` (`data-mk-inset` on `.mk-island`); under
`SHEET_BREAKPOINT_PX` the panel is a sheet off the bottom edge with nowhere
beside it to stand, so the island gives way instead. Nothing in the overlay
solves this with a `z-index`: an inventory half-covered by the thing it just
opened reads as a stack of two cards whichever one is on top.

## The bundle budget

The adopted stylesheet, the root with marks, the island and the icons, the
composer, the picker and the mock box each have a gzipped budget of their own.
The numbers live only in `packages/ui/scripts/size.js`, which runs
as the second half of this package's `build`, so the existing CI build job
enforces it. It measures this package's own emitted modules; `react` is a peer
and the other two workspace packages carry their own budgets.

A part reaching for an icon imports it relatively, not through
`@maple-kit/ui/icons`, or its weight is counted against nothing.

## What the CSP claim needs from a part

`docs/overlay-csp.md` is the claim. In this package it means: one shadow root,
styled only through `createOverlayStyleSheet`; positions set with
`style.setProperty()` and never by assigning `cssText`; no workers; and nothing
that constructs a `CSSStyleSheet`, reads `localStorage` or touches `document` at
module scope. `packages/ui/test/surface.test.ts` fails on any of them.
