/**
 * The marks' half of the adopted stylesheet.
 *
 * It is its own module so `src/stylesheet.ts` composes rather than grows, and
 * so this file is the one place a mark's look is decided. Every value here is
 * a token: a rule that spelled its own duration would stop honouring reduced
 * motion the moment a reviewer asked for it.
 */

/** Nothing here is positioned by a rule: a frame sets these four per node. */
const POSITIONED = `
  position: absolute;
  top: 0;
  left: 0;
  translate: var(--mk-x) var(--mk-y);
`.trim();

/**
 * A reviewer's colour arrives as `--mk-slot`, so an open comment takes its
 * author's hue and a status with something to say takes its colour over it.
 */
function paintCss(): string {
  return `
/* A mark is drawn in its status, not in its author's hue: where a comment is
   in its life is what a reviewer scans the page for, and who wrote it is the
   name beside it. The row's leaf answers to the same four rules, because a
   comment drawn two ways in two places is two comments. */
:is(.mk-mark, .mk-rowleaf) {
  --mk-paint: var(--mk-pin, var(--mk-accent));
  --mk-ink: var(--mk-pin-ink, var(--mk-accent-ink));
}

.mk-avatar {
  --mk-paint: var(--mk-pin, var(--mk-slot, var(--mk-accent)));
  --mk-ink: var(--mk-pin-ink, var(--mk-slot-ink, var(--mk-accent-ink)));
}

:is(.mk-mark, .mk-rowleaf)[data-status="needs_reverify"] {
  --mk-paint: var(--mk-pin, var(--mk-warn));
  --mk-ink: var(--mk-pin-ink, var(--mk-warn-sub));
}

:is(.mk-mark, .mk-rowleaf)[data-status="resolved"] {
  --mk-paint: var(--mk-pin, var(--mk-ok));
  --mk-ink: var(--mk-pin-ink, var(--mk-bg));
}

/* Held back, not faded out: at 0.6 a resolved mark read as one that had
   failed to load, and a reviewer re-checking it has to be able to see it. */
.mk-mark[data-status="resolved"] {
  opacity: 0.85;
}

/* Unpinned never reached the page and unsent never left it, so neither takes
   a status colour: grey is what separates them from an open comment, which
   is drawn in the same outline. */
:is(.mk-mark, .mk-rowleaf)[data-status="orphaned"],
:is(.mk-mark, .mk-rowleaf)[data-sent="false"] {
  --mk-paint: var(--mk-pin, var(--mk-muted));
  --mk-ink: var(--mk-pin-ink, var(--mk-muted));
}
`;
}

/** The leaf: a halo, a body, a counter-filled ring and a dashed edge. */
function leafCss(): string {
  return `
.mk-leaf {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}

.mk-leaf-halo {
  fill: var(--mk-bg);
  stroke: var(--mk-bg);
  stroke-width: 8;
  stroke-linejoin: round;
}

.mk-leaf-body {
  fill: var(--mk-paint);
  stroke: var(--mk-paint);
  stroke-width: 1.5;
  stroke-linejoin: round;
}

/* The ring is a filled shape carrying its own counter, so it keeps one weight
   at every size and recolours with one declaration. A dashed stroke was tried
   and reads as a broken leaf rather than an empty one, which is a different
   sentence about the comment. The stroke on top of the fill is what gives it
   weight: the drawn path alone is a hairline beside the solid form. */
.mk-leaf-edge {
  fill: var(--mk-paint);
  stroke: var(--mk-paint);
  stroke-width: 1.6;
  stroke-linejoin: round;
}
`;
}

/**
 * The mark. Its position is a custom property and carries no transition: a
 * transition on a position lags a frame behind the page it is standing on.
 */
function markCss(): string {
  return `
.mk-marks {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.mk-mark {
  ${POSITIONED}
  --mk-mark-up: 1.18;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  padding: 0;
  border: 0;
  border-radius: var(--mk-r-xs);
  background: transparent;
  color: var(--mk-ink);
  cursor: pointer;
  pointer-events: auto;
  filter: drop-shadow(var(--mk-sh1));
  animation: mk-mark-in var(--mk-dur-mark-in) var(--mk-ease-entrance);
  transition:
    transform var(--mk-dur-fade) var(--mk-ease-surface),
    opacity var(--mk-dur-fade) var(--mk-ease-surface);
}

/* A row pointed at is the same gesture as a mark pointed at, so it gets the
   same answer: the mark grows and comes forward. The glow below is the click's
   alone — that one outlives the hand, and this does not. */
.mk-mark:hover,
.mk-mark:focus-visible,
.mk-mark[data-mk-peeked="true"],
.mk-mark[aria-pressed="true"] {
  transform: scale(var(--mk-mark-up));
  opacity: 1;
  z-index: 3;
}

.mk-mark:active {
  transform: scale(calc(var(--mk-mark-up) * var(--mk-press)));
}

/* Moved out of the way of what it was covering. The cursor says so before the
   drag starts, because nothing else on the page suggests a mark can move. */
.mk-mark[data-mk-nudged="true"] {
  cursor: grab;
}

.mk-mark[data-mk-dragging="true"] {
  cursor: grabbing;
  transition: none;
  z-index: 4;
}

/* A box-shadow on the 38px button draws a rounded square behind a leaf, which
   reads as a second object. A drop-shadow takes the alpha, so it takes the leaf. */
.mk-mark[aria-pressed="true"] {
  filter:
    drop-shadow(0 0 3px color-mix(in oklab, var(--mk-paint) 70%, transparent))
    drop-shadow(0 0 9px color-mix(in oklab, var(--mk-paint) 45%, transparent))
    drop-shadow(var(--mk-sh1));
}

.mk-mark[aria-pressed="true"] .mk-leaf-halo {
  stroke-width: 10;
}

/* The leaf's mass sits below its middle — the stem is the long end — so a
   box-centred number reads high inside it. 1px down is where it looks centred,
   which is 2px from where the box says it is. */
.mk-mark-n {
  --mk-n: 11px;
  position: relative;
  font-size: var(--mk-n);
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
  color: var(--mk-ink);
  transform: translateY(1px);
}

/* Two digits are twice the width in the same waist. The leaf does not grow —
   a mark that changed size at the tenth comment would be a different object —
   so the number gives way instead. */
.mk-mark-n[data-mk-digits="2"] {
  font-size: calc(var(--mk-n) * 0.9);
  letter-spacing: -0.05em;
}

.mk-mark-n[data-mk-digits="3"] {
  font-size: calc(var(--mk-n) * 0.78);
  letter-spacing: -0.06em;
}

:is(.mk-mark, .mk-rowleaf)[data-form="outline"] .mk-mark-n {
  color: var(--mk-paint);
}

/* A half-filled leaf puts the waterline through the number, so the glyph is
   two colours at once and legible in neither. Stroking it in the paint, under
   the fill, sits it on its own colour wherever the waterline happens to fall. */
:is(.mk-mark, .mk-rowleaf)[data-form="partial"] .mk-mark-n {
  paint-order: stroke fill;
  -webkit-text-stroke: 2.5px var(--mk-paint);
}

/* A weak anchor thins the fill and leaves the ring at full strength: how sure
   the anchor is and how far through its life the comment is are two signals,
   and one washing out the other is how they stop being two. */
.mk-mark[data-confidence="weak"] .mk-leaf-body {
  fill-opacity: 0.42;
}

.mk-mark[data-confidence="weak"] .mk-leaf-edge {
  fill-opacity: 1;
}

@keyframes mk-mark-in {
  from {
    opacity: 0;
    transform: translateY(var(--mk-rise-mark));
  }
}
`;
}

/** The ring, its label, and one rectangle per line of a passage. */
function ringCss(): string {
  return `
.mk-ring {
  ${POSITIONED}
  width: var(--mk-w);
  height: var(--mk-h);
  border-radius: var(--mk-r-sm);
  pointer-events: none;
  box-shadow:
    0 0 0 2px var(--mk-accent),
    0 0 0 7px color-mix(in oklab, var(--mk-accent) 20%, transparent);
  animation: mk-ring-in var(--mk-dur-fade) var(--mk-ease-surface);
  transition: opacity var(--mk-dur-fade) var(--mk-ease-surface);
}

.mk-ring[data-mk-moving] {
  will-change: transform;
}

/* No quieter hovered ring: pointing at a mark or tabbing onto it is asking
   "which one", and a hairline answered it too faintly to be seen. */

/* A passage is its own lines and nothing else: the box around them is the
   paragraph, and outlining that says the comment is on the paragraph. */
.mk-ring[data-mk-passage="true"] {
  box-shadow: none;
}

/* A region is an area, not a thing: it is filled as well as outlined, in the
   picker's own band, so what a reviewer drew is what they get back. It has no
   outer halo — the halo reads as a margin around an element, and there is no
   element here to have one. */
.mk-ring[data-mk-region="true"] {
  border-radius: var(--mk-r-xs);
  background: color-mix(in oklab, var(--mk-accent) 18%, transparent);
  box-shadow: 0 0 0 2px var(--mk-accent);
}


/* Anchored to the ring's edge rather than offset by a number: the label is two
   lines in developer detail and one line the rest of the time. */
.mk-ring-label {
  position: absolute;
  bottom: 100%;
  left: -2px;
  display: flex;
  flex-direction: column;
  max-width: 260px;
  margin-bottom: 3px;
  padding: 1px 7px 2px;
  border-radius: var(--mk-r-xs) var(--mk-r-xs) var(--mk-r-xs) 0;
  background: var(--mk-accent);
  color: var(--mk-accent-ink);
  font-size: 10px;
  font-weight: 600;
}

.mk-ring-label[data-mk-below] {
  bottom: auto;
  top: 100%;
  margin: 3px 0 0;
  border-radius: 0 var(--mk-r-xs) var(--mk-r-xs) var(--mk-r-xs);
}

.mk-ring-name,
.mk-ring-note {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Quieter than the name: it is where to go next, not what this is. */
.mk-ring-note {
  font-size: 9px;
  font-weight: 500;
  color: color-mix(in oklab, var(--mk-accent-ink) 78%, transparent);
}

/* The wash a reviewer reads as "this text": the same green the ring is drawn
   in, at the weight a selection has, so the passage is what is highlighted
   and the element around it is not. */
.mk-ring-run {
  ${POSITIONED}
  width: var(--mk-w);
  height: var(--mk-h);
  border-radius: 3px;
  background: color-mix(in oklab, var(--mk-accent) 32%, transparent);
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--mk-accent) 45%, transparent);
}

@keyframes mk-ring-in {
  from {
    opacity: 0;
  }
}
`;
}

/** The same leaf at avatar size: provenance is the whole of the signal. */
function avatarCss(): string {
  return `
.mk-avatar {
  position: relative;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
}

.mk-avatar .mk-leaf-body {
  stroke-width: 2;
}

.mk-avatar-ini {
  position: relative;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--mk-ink);
  transform: translateY(0.5px);
}

.mk-avatar[data-provenance="client"] .mk-leaf-body {
  fill-opacity: 0.4;
  stroke-width: 2.5;
}

.mk-avatar[data-provenance="client"] .mk-avatar-ini {
  color: var(--mk-fg);
}

.mk-avatar[data-provenance="guest"] .mk-avatar-ini {
  color: var(--mk-paint);
}
`;
}

/** Off-screen is hidden rather than unmounted, so nothing lands twice. */
function cullCss(): string {
  return `
.mk-mark[data-mk-off],
.mk-ring[data-mk-off] {
  visibility: hidden;
}
`;
}

/** Everything the marks add to the overlay's one stylesheet. */
export function marksCss(): string {
  return [paintCss(), leafCss(), markCss(), ringCss(), avatarCss(), cullCss()]
    .map((block) => block.trim())
    .join("\n\n");
}
