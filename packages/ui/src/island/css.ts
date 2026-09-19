/**
 * The island's rules, composed into the one adopted stylesheet.
 *
 * It is a string built from the token contract like the rest of the sheet, so
 * no part writes a colour, a radius, a duration or an easing of its own and
 * reduced motion stays one redefinition rather than a rule switched off. The
 * stagger is nth-child rather than a property per row: six rows step, and
 * everything after them arrives together at the cap.
 */

import { STAGGER_ROWS } from "./stagger.js";

/** Every rule the island needs, and nothing another part owns. */
export function islandCss(): string {
  return [
    shell(),
    corners(),
    header(),
    filters(),
    list(),
    row(),
    rowDetail(),
    developer(),
    newComment(),
    keyframes(),
  ].join("\n\n");
}

function shell(): string {
  return `
.mk-island {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: flex;
  align-items: flex-end;
  pointer-events: none;
}

.mk-island > * {
  pointer-events: auto;
}

.mk-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 6px 13px 6px 10px;
  border: 1px solid var(--mk-line-firm);
  border-radius: 999px;
  background: color-mix(in oklab, var(--mk-bg) 90%, transparent);
  backdrop-filter: blur(12px) saturate(1.3);
  box-shadow: var(--mk-sh2);
  color: var(--mk-fg);
  font: inherit;
  font-size: 12px;
  font-weight: 550;
  cursor: pointer;
  transition:
    transform var(--mk-dur-fade) var(--mk-ease-surface),
    box-shadow var(--mk-dur-fade) var(--mk-ease-surface),
    border-color var(--mk-dur-fade) var(--mk-ease-surface);
}

.mk-pill:hover {
  transform: translateY(-2px);
  box-shadow: var(--mk-sh3);
}

.mk-pill:active {
  transform: scale(var(--mk-press));
}

.mk-pill[data-armed="true"] {
  border-color: var(--mk-accent);
  color: var(--mk-accent);
}

.mk-logo-leaf {
  flex: none;
  display: block;
  color: var(--mk-accent);
  filter: saturate(0.9);
}

/* The logo's leaf is decorative and monochrome. Styling the shared .mk-leaf
   here would outrank the status colours a real mark paints on its own paths. */
.mk-logo-leaf path {
  fill: currentColor;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linejoin: round;
}

.mk-card {
  position: absolute;
  right: 0;
  bottom: 0;
  z-index: 1;
  width: 320px;
  max-width: calc(100vw - 24px);
  max-height: min(78vh, 460px);
  min-height: min(330px, 62vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transform-origin: bottom right;
  animation: mk-island-in var(--mk-dur-island-open) var(--mk-ease-surface);
}

.mk-card[data-mk-phase="closing"] {
  animation: mk-island-out var(--mk-dur-island-close) var(--mk-ease-surface) forwards;
}
`.trim();
}

/**
 * The island sits in one of four corners and snaps between them, so a drag
 * ends somewhere a second island would also land rather than a pixel off it.
 */
function corners(): string {
  return `
.mk-island[data-mk-corner="bottom-left"],
.mk-island[data-mk-corner="top-left"] {
  right: auto;
  left: 12px;
}

.mk-island[data-mk-corner="top-left"],
.mk-island[data-mk-corner="top-right"] {
  bottom: auto;
  top: 12px;
  align-items: flex-start;
}

.mk-island[data-mk-corner="bottom-left"] .mk-card,
.mk-island[data-mk-corner="top-left"] .mk-card {
  right: auto;
  left: 0;
}

.mk-island[data-mk-corner="top-left"] .mk-card,
.mk-island[data-mk-corner="top-right"] .mk-card {
  bottom: auto;
  top: 0;
}

.mk-island[data-mk-corner="top-left"] .mk-card {
  transform-origin: top left;
}

.mk-island[data-mk-corner="top-right"] .mk-card {
  transform-origin: top right;
}

.mk-island[data-mk-corner="bottom-left"] .mk-card {
  transform-origin: bottom left;
}

/* No transition on the offset: the island is under the pointer while it is
   dragged, and a transition would leave it trailing the hand that moved it. */
.mk-island[data-mk-dragging="true"] {
  transform: translate(var(--mk-x), var(--mk-y));
  will-change: transform;
}

.mk-island[data-mk-dragging="true"] .mk-pill {
  transform: none;
  cursor: grabbing;
  box-shadow: var(--mk-sh3);
}
`.trim();
}

function header(): string {
  return `
.mk-head {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 9px 8px 11px;
  border-bottom: 1px solid var(--mk-line);
}

.mk-head-title {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 12.5px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.mk-spacer {
  flex: 1 1 auto;
}

.mk-branch {
  max-width: 132px;
  padding: 2px 8px;
  border: 1px solid var(--mk-line);
  border-radius: 999px;
  background: var(--mk-sunk);
  color: var(--mk-muted);
  font-family: var(--mk-mono);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mk-iconbtn {
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: var(--mk-r-sm);
  background: transparent;
  color: var(--mk-faint);
  cursor: pointer;
  transition:
    background-color var(--mk-dur-fade) var(--mk-ease-surface),
    color var(--mk-dur-fade) var(--mk-ease-surface),
    transform var(--mk-dur-fade) var(--mk-ease-surface);
}

.mk-iconbtn:hover,
.mk-iconbtn[aria-expanded="true"] {
  background: var(--mk-sunk);
  color: var(--mk-fg);
}

.mk-iconbtn:active {
  transform: scale(var(--mk-press));
}

.mk-settings-anchor {
  display: contents;
}

/* The card's own width, and the card's own bottom corners: a panel inset from
   one edge and not the other reads as a surface that missed. */
${settingsPanel()}

${preferenceControls()}


.mk-switch {
  position: relative;
  flex: none;
  width: 34px;
  height: 20px;
  margin-top: 1px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: var(--mk-line-firm);
  cursor: pointer;
  transition:
    background-color var(--mk-dur-swap) var(--mk-ease-swap),
    transform var(--mk-dur-fade) var(--mk-ease-surface);
}

.mk-switch::before {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--mk-hit);
  height: var(--mk-hit);
  transform: translate(-50%, -50%);
}

.mk-switch::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: var(--mk-bg);
  box-shadow: var(--mk-sh1);
  transition: transform var(--mk-dur-swap) var(--mk-ease-entrance);
}

.mk-switch:active {
  transform: scale(var(--mk-press));
}

.mk-switch[aria-checked="true"] {
  background: var(--mk-accent);
}

.mk-switch[aria-checked="true"]::after {
  transform: translateX(14px);
}
`.trim();
}

/** The panel itself: the card's own width, and the card's own bottom corners. */
function settingsPanel(): string {
  return `
.mk-settings {
  position: absolute;
  top: 100%;
  right: 0;
  left: 0;
  z-index: 5;
  padding: 12px;
  border-top: 1px solid var(--mk-line);
  border-radius: 0 0 var(--mk-r) var(--mk-r);
  background: var(--mk-bg);
  box-shadow: var(--mk-sh3);
  transform-origin: top center;
  animation: mk-pop-in var(--mk-dur-tooltip) var(--mk-ease-surface);
}

.mk-setting {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.mk-setting + .mk-setting {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--mk-line);
}

.mk-setting-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--mk-fg);
}

.mk-setting-hint {
  display: block;
  margin-top: 2px;
  font-size: 10.5px;
  line-height: 1.4;
  color: var(--mk-faint);
  text-wrap: pretty;
}
`.trim();
}

/** The two controls the settings panel is mostly made of. */
function preferenceControls(): string {
  return `
.mk-seg {
  flex: none;
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  background: var(--mk-sunk);
}

.mk-seg-one {
  padding: 3px 8px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--mk-muted);
  font: inherit;
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color var(--mk-dur-swap) var(--mk-ease-swap),
    color var(--mk-dur-swap) var(--mk-ease-swap);
}

.mk-seg-one[aria-checked="true"] {
  background: var(--mk-bg);
  box-shadow: var(--mk-sh1);
  color: var(--mk-fg);
}

/* The control is the shape of the thing it sets: a screen, with a dot in
   whichever corner the island is in. */
.mk-corners {
  flex: none;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2px;
  width: 38px;
  height: 28px;
  padding: 2px;
  border: 1px solid var(--mk-line);
  border-radius: var(--mk-r-xs);
  background: var(--mk-sunk);
}

.mk-corner {
  position: relative;
  border: 0;
  border-radius: 2px;
  background: transparent;
  cursor: pointer;
  transition: background-color var(--mk-dur-swap) var(--mk-ease-swap);
}

.mk-corner:hover {
  background: var(--mk-line);
}

.mk-corner::after {
  content: "";
  position: absolute;
  inset: 2px;
  border-radius: 1px;
  background: var(--mk-line-firm);
  transition: background-color var(--mk-dur-swap) var(--mk-ease-swap);
}

.mk-corner[aria-checked="true"]::after {
  background: var(--mk-accent);
}
`.trim();
}

function filters(): string {
  return `
.mk-filters {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 9px;
  border-bottom: 1px solid var(--mk-line);
}

/* The chevron is two borders rotated, not an inline SVG: a data URI in a
   background would need img-src data: in the host's policy, and the overlay
   promises to ask for nothing beyond blob:. */
.mk-filter-chip {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  min-width: 0;
}

.mk-filter-chip::after {
  content: "";
  position: absolute;
  right: 9px;
  width: 5px;
  height: 5px;
  border-right: 1.5px solid var(--mk-muted);
  border-bottom: 1.5px solid var(--mk-muted);
  rotate: 45deg;
  translate: 0 -2px;
  pointer-events: none;
}

.mk-filter-pick {
  width: 100%;
  padding: 3px 22px 3px 10px;
  border: 1px solid var(--mk-line);
  border-radius: 999px;
  background: transparent;
  color: var(--mk-fg);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  appearance: none;
  cursor: pointer;
  transition:
    border-color var(--mk-dur-swap) var(--mk-ease-swap),
    background-color var(--mk-dur-swap) var(--mk-ease-swap);
}

.mk-filter-pick:hover {
  border-color: var(--mk-line-firm);
  background: var(--mk-sunk);
}

/* The native menu is the host page's surface, not the overlay's: it renders
   outside the shadow root, so it is given readable colours rather than left
   to inherit a transparent background. */
.mk-filter-pick option {
  background: var(--mk-bg);
  color: var(--mk-fg);
}

.mk-tally {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.mk-tally-one {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 6px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--mk-faint);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color var(--mk-dur-swap) var(--mk-ease-swap),
    border-color var(--mk-dur-swap) var(--mk-ease-swap),
    color var(--mk-dur-swap) var(--mk-ease-swap);
}

.mk-tally-one:hover {
  background: var(--mk-sunk);
  color: var(--mk-muted);
}

.mk-tally-one[aria-pressed="true"] {
  border-color: var(--mk-line-firm);
  color: var(--mk-fg);
}

.mk-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--mk-tally-paint);
}

/* A count of nothing is not news: the dot stays, so the key is still complete,
   and the row stops competing with the ones that have something in them. */
.mk-tally-one[data-mk-zero="true"] {
  opacity: 0.45;
}

.mk-tally-one[data-tally="open"] {
  --mk-tally-paint: var(--mk-accent);
}

.mk-tally-one[data-tally="needs_reverify"] {
  --mk-tally-paint: var(--mk-warn);
}

.mk-tally-one[data-tally="resolved"] {
  --mk-tally-paint: var(--mk-ok);
}

.mk-tally-one[data-tally="unpinned"] {
  --mk-tally-paint: var(--mk-lost);
}

`.trim();
}

function list(): string {
  return `
.mk-list {
  flex: 1 1 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.mk-empty {
  padding: 26px 16px;
  text-align: center;
  color: var(--mk-faint);
  font-size: 12.5px;
  text-wrap: balance;
}
`.trim();
}

function row(): string {
  const steps = Array.from({ length: STAGGER_ROWS }, (_, index) => rowDelay(index + 1)).join(
    "\n\n",
  );

  return `
.mk-row {
  display: block;
  padding: 11px 12px;
  border-bottom: 1px solid var(--mk-line);
  animation: mk-row-in var(--mk-dur-fade) var(--mk-ease-surface) backwards;
  transition:
    background-color var(--mk-dur-fade) var(--mk-ease-surface),
    padding-left var(--mk-dur-fade) var(--mk-ease-surface);
}

.mk-row:hover {
  background: var(--mk-sunk);
  padding-left: 14px;
}

${steps}

.mk-row:nth-child(n + ${String(STAGGER_ROWS + 1)}) {
  animation-delay: var(--mk-stagger-cap);
}

.mk-row-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 5px;
}

.mk-who {
  flex: 1 1 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.mk-avatar {
  position: relative;
  flex: none;
  display: grid;
  place-items: center;
  width: 21px;
  height: 21px;
}

.mk-avatar svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.mk-avatar path {
  fill: var(--mk-slot);
  stroke: var(--mk-slot);
  stroke-width: 2;
  stroke-linejoin: round;
}

.mk-avatar[data-provenance="client"] path {
  fill: color-mix(in oklab, var(--mk-slot) 40%, transparent);
  stroke-width: 2.5;
}

.mk-avatar[data-provenance="guest"] path {
  fill: none;
  stroke-width: 3.5;
  stroke-dasharray: 7 5;
}

.mk-initials {
  position: relative;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--mk-slot-ink);
  transform: translateY(-0.5px);
}

.mk-avatar[data-provenance="client"] .mk-initials {
  color: var(--mk-fg);
}

.mk-avatar[data-provenance="guest"] .mk-initials {
  color: var(--mk-slot);
}
`.trim();
}

function rowDetail(): string {
  return `
.mk-name {
  font-size: 12.5px;
  font-weight: 600;
}

.mk-who[data-provenance="client"] .mk-name,
.mk-who[data-provenance="guest"] .mk-name {
  font-weight: 500;
  color: var(--mk-muted);
}

.mk-when {
  color: var(--mk-faint);
  font-size: 11px;
}

.mk-index {
  font-family: var(--mk-mono);
  font-size: 10px;
  color: var(--mk-faint);
  font-variant-numeric: tabular-nums;
}

.mk-text {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 12.5px;
  color: var(--mk-fg);
  text-wrap: pretty;
}

.mk-row[data-mk-expanded="true"] .mk-text {
  display: block;
  -webkit-line-clamp: unset;
}

.mk-more {
  margin-top: 4px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--mk-accent);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: transform var(--mk-dur-fade) var(--mk-ease-surface);
}

.mk-more:active {
  transform: scale(var(--mk-press));
}

.mk-meta {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  margin-top: 6px;
}

.mk-meta:empty {
  display: none;
}

.mk-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 7px 1px 5px;
  border: 1px solid var(--mk-line);
  border-radius: 999px;
  background: var(--mk-sunk);
  color: var(--mk-muted);
  font-size: 10.5px;
  font-weight: 650;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.mk-chip svg {
  opacity: 0.75;
}

.mk-chip-warn {
  border-color: transparent;
  background: var(--mk-warn-sub);
  color: var(--mk-warn);
}

.mk-chip-ok {
  border-color: transparent;
  background: var(--mk-ok-sub);
  color: var(--mk-ok);
}

.mk-chip-info {
  border-color: transparent;
  background: var(--mk-info-sub);
  color: var(--mk-info);
}

.mk-chip-lost {
  border-color: color-mix(in oklab, var(--mk-lost) 45%, transparent);
  border-style: dashed;
  background: transparent;
  color: var(--mk-lost);
}
`.trim();
}

function rowDelay(position: number): string {
  return `.mk-row:nth-child(${String(position)}) {
  animation-delay: calc(var(--mk-stagger-step) * ${String(position - 1)});
}`;
}

/**
 * Developer detail: the chip carries the number and the tooltip carries the
 * sentence, because a sentence in a scanned row is skipped along with its row.
 */
function developer(): string {
  return `
.mk-tipped {
  position: relative;
  cursor: help;
}

/* The top layer, because the card hides its overflow and nothing else gets out
   of an ancestor's. Placed by tipSpot, in viewport coordinates, which is what
   the top layer is positioned against. */
.mk-tip {
  position: fixed;
  top: 0;
  left: 0;
  margin: 0;
  translate: var(--mk-x) var(--mk-y);
  width: max-content;
  max-width: 228px;
  padding: 6px 8px;
  border: 1px solid var(--mk-line-firm);
  border-radius: var(--mk-r-sm);
  background: var(--mk-bg);
  box-shadow: var(--mk-sh2);
  color: var(--mk-muted);
  font-size: 11px;
  font-weight: 450;
  line-height: 1.4;
  letter-spacing: normal;
  white-space: normal;
  text-wrap: pretty;
  opacity: 0;
  transform: scale(var(--mk-scale-tooltip));
  transform-origin: bottom left;
  pointer-events: none;
  transition:
    opacity var(--mk-dur-tooltip) var(--mk-ease-tooltip),
    transform var(--mk-dur-tooltip) var(--mk-ease-tooltip);
}

/* The delay is on the way in only. A hover-out is a dismissal, and a
   dismissal that waits reads as a surface that did not hear the pointer. */
.mk-tip:popover-open {
  opacity: 1;
  transform: scale(1);
  transition-delay: var(--mk-delay-tooltip);
}

/* A popover keeps its own inset and border, and both fight the placement. */
.mk-tip:not(:popover-open) {
  display: none;
}

.mk-chip-dev {
  border-style: dashed;
  border-color: var(--mk-line-firm);
  background: transparent;
}

.mk-path {
  display: inline-block;
  max-width: 124px;
  overflow: hidden;
  vertical-align: bottom;
  font-family: var(--mk-mono);
  font-size: 10px;
  font-weight: 500;
  text-overflow: ellipsis;
}
`.trim();
}

function newComment(): string {
  return `
.mk-new {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 7px 8px 8px;
  border-top: 1px solid var(--mk-line);
  background: var(--mk-sunk);
}

.mk-new-label {
  padding: 0 2px;
  color: var(--mk-faint);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.mk-picks {
  display: flex;
  gap: 4px;
}

.mk-pick {
  flex: 1 1 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 4px 10px;
  border: 1px solid var(--mk-line);
  border-radius: 999px;
  background: transparent;
  color: var(--mk-muted);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color var(--mk-dur-swap) var(--mk-ease-swap),
    color var(--mk-dur-swap) var(--mk-ease-swap),
    border-color var(--mk-dur-swap) var(--mk-ease-swap),
    transform var(--mk-dur-fade) var(--mk-ease-surface);
}

.mk-pick svg {
  opacity: 0.75;
  transition: opacity var(--mk-dur-swap) var(--mk-ease-swap);
}

.mk-pick:hover {
  background: var(--mk-bg);
  color: var(--mk-fg);
  transform: translateY(-1px);
}

.mk-pick:hover svg,
.mk-pick[aria-pressed="true"] svg {
  opacity: 1;
}

.mk-pick:active {
  transform: scale(var(--mk-press));
}

.mk-pick[aria-pressed="true"] {
  border-color: transparent;
  background: var(--mk-accent);
  color: var(--mk-accent-ink);
}
`.trim();
}

function keyframes(): string {
  return `
@keyframes mk-island-in {
  from {
    opacity: 0;
    transform: translateY(12px) scale(var(--mk-scale-island));
  }
}

@keyframes mk-island-out {
  to {
    opacity: 0;
    transform: translateY(6px) scale(var(--mk-scale-island));
  }
}

@keyframes mk-pop-in {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(var(--mk-scale-tooltip));
  }
}

@keyframes mk-row-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
}
`.trim();
}
