/**
 * The island's rules, composed into the one adopted stylesheet.
 *
 * It is a string built from the token contract like the rest of the sheet, so
 * no part writes a colour, a radius, a duration or an easing of its own and
 * reduced motion stays one redefinition rather than a rule switched off. The
 * stagger is nth-child rather than a property per row: six rows step, and
 * everything after them arrives together at the cap.
 */

import { SHEET_BREAKPOINT_PX } from "../tokens.js";
import { resizeCss } from "./resize-css.js";
import { STAGGER_ROWS } from "./stagger.js";

/** Every rule the island needs, and nothing another part owns. */
export function islandCss(): string {
  return [
    shell(),
    corners(),
    resizeCss(),
    header(),
    filters(),
    list(),
    row(),
    rowDetail(),
    ledger(),
    approve(),
    link(),
    transfer(),
    newComment(),
    keyframes(),
    sheet(),
  ].join("\n\n");
}

/**
 * Under the breakpoint the panel is a sheet off the bottom edge with nowhere
 * beside it to stand, so the island gives way rather than moving.
 */
function sheet(): string {
  return `
@media (max-width: ${String(SHEET_BREAKPOINT_PX - 1)}px) {
  .mk-island[data-mk-inset="true"] {
    translate: none;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--mk-dur-composer-open) var(--mk-ease-surface);
  }
}
`.trim();
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
  transition: translate var(--mk-dur-composer-open) var(--mk-ease-surface);
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

/* The lockup. Both halves are their own ink box, so centring them centres the
   drawing rather than two boxes of whitespace. The gap and the word's rise
   are fractions of the leaf's edge, so the component sets both inline and
   nothing here can disagree with it. */
.mk-wordmark {
  flex: none;
  display: inline-flex;
  align-items: center;
}

/* The leaf is artwork and paints its own 33 colours. No colour, no fill and
   no stroke here: every one of them would flatten the drawing. */
.mk-wordmark-leaf {
  flex: none;
  display: block;
}

.mk-wordmark-word {
  flex: none;
  display: block;
  fill: var(--mk-fg);
}

.mk-card {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 400px;
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

/* A surface beside the panel, never under it: an inventory half-covered by the
   thing it just opened reads as a stack of two cards. */
.mk-island[data-mk-inset="true"][data-mk-corner="bottom-right"],
.mk-island[data-mk-inset="true"][data-mk-corner="top-right"] {
  translate: calc(-1 * var(--mk-composer-w)) 0;
}

/* No transition on the offset: the island is under the pointer while it is
   dragged, and a transition would leave it trailing the hand that moved it. */
.mk-island[data-mk-dragging="true"] {
  transform: translate(var(--mk-x), var(--mk-y));
  transition: none;
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
/* A fixed height, not a padded one: the settings panel is positioned against
   the card so it can be bounded by it, and it starts where this ends. */
.mk-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  height: var(--mk-head-h);
  padding: 0 9px 0 11px;
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

/* An application that replaces the wordmark with its own text gets the type
   back; the drawing sets its own size and ignores this. */
.mk-head-title:has(.mk-wordmark) {
  font-size: 0;
}

.mk-spacer {
  flex: 1 1 auto;
}

a.mk-branch {
  color: var(--mk-ok);
  text-decoration: none;
  transition:
    background-color var(--mk-dur-fade) var(--mk-ease-surface),
    color var(--mk-dur-fade) var(--mk-ease-surface),
    border-color var(--mk-dur-fade) var(--mk-ease-surface);
}

a.mk-branch:hover,
a.mk-branch:focus-visible {
  border-color: var(--mk-line-firm);
  background: var(--mk-bg);
  color: var(--mk-fg);
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

/* 32 + the header's 8px gap is 40, which is what keeps the two of them from
   sharing a hit area: the ::after squares would otherwise overlap by four. */
.mk-iconbtn {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 28px;
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

/** The panel: the card's whole body, so nothing in it can fall off the end. */
function settingsPanel(): string {
  return `
/* Pinned to the card's own bottom rather than hung off the header: hung off
   it, everything past the card's height was cut off by the card, which is
   where Developer mode and Hide the island went. */
.mk-settings {
  position: absolute;
  top: var(--mk-head-h);
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 5;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px;
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

/* The one row here that is not a preference: something is wrong with the
   build, in the warm colour the overlay uses for what Maple noticed itself. */
.mk-setting[data-mk-maple] .mk-setting-name {
  color: var(--mk-maple);
}

.mk-setting-hint {
  display: block;
  margin-top: 2px;
  font-size: 10.5px;
  line-height: 1.4;
  color: var(--mk-faint);
  text-wrap: pretty;
}

.mk-acct-code {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}

.mk-acct-code code {
  padding: 3px 7px;
  border-radius: var(--mk-r-xs);
  background: var(--mk-sunk);
  color: var(--mk-fg);
  font-family: var(--mk-mono);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  user-select: all;
}

.mk-acct-code a {
  color: var(--mk-accent);
  font-size: 10.5px;
  font-weight: 600;
}

.mk-acct-do {
  flex: none;
  padding: 3px 9px;
  border: 1px solid var(--mk-line);
  border-radius: 999px;
  background: var(--mk-bg);
  color: var(--mk-fg);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: transform var(--mk-dur-fade) var(--mk-ease-surface);
}

.mk-acct-do:active {
  transform: scale(var(--mk-press));
}

/* Unlinking forgets the token here: it reads as the destructive thing it is. */
.mk-acct-danger {
  border-color: var(--mk-danger);
  background: transparent;
  color: var(--mk-danger);
}

.mk-acct-danger:hover {
  background: var(--mk-danger-sub);
}

.mk-setting-main {
  flex: 1 1 auto;
  min-width: 0;
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
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  gap: 4px;
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
  flex: 1 1 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
  min-width: 0;
}

.mk-tally-one {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px 3px;
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

.mk-empty-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 22px 16px 24px;
}

.mk-empty-art {
  margin-bottom: 6px;
}

.mk-empty-title {
  margin: 0;
  color: var(--mk-fg);
  font-size: 13px;
  font-weight: 650;
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
/* The rail's two pixels are held from the start, in nothing. A row that gained
   them on hover moved every word in it sideways, which reads as the list
   redrawing rather than as the row answering. */
.mk-row {
  display: block;
  padding: 11px 12px 11px 14px;
  border-bottom: 1px solid var(--mk-line);
  box-shadow: inset 2px 0 0 transparent;
  cursor: pointer;
  animation: mk-row-in var(--mk-dur-fade) var(--mk-ease-surface) backwards;
  transition:
    background-color var(--mk-dur-fade) var(--mk-ease-surface),
    box-shadow var(--mk-dur-fade) var(--mk-ease-surface);
}

.mk-row:hover {
  background: var(--mk-sunk);
  box-shadow: inset 2px 0 0 color-mix(in oklab, var(--mk-accent) 35%, transparent);
}

/* A rail, not a wash: the wash is what hover already means, and the row a mark
   or a link landed on has to stay legible while the pointer is over another. */
.mk-row[data-mk-selected="true"] {
  box-shadow: inset 2px 0 0 var(--mk-accent);
}

${steps}

.mk-row:nth-child(n + ${String(STAGGER_ROWS + 1)}) {
  animation-delay: var(--mk-stagger-cap);
}

/* Held in the layout and drawn only on hover or focus, so a row that gains the
   button does not move. A pointer-less device reaches it by focus alone. */
.mk-btn.mk-quick {
  margin-left: auto;
  padding: 1px 7px;
  font-size: 11px;
  opacity: 0;
  transition:
    opacity var(--mk-dur-fade) var(--mk-ease-surface),
    background-color var(--mk-dur-fade) var(--mk-ease-surface),
    filter var(--mk-dur-fade) var(--mk-ease-surface);
}

.mk-row:hover .mk-quick,
.mk-row:focus-within .mk-quick {
  opacity: 1;
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

/* The comment's own leaf, at row size. It draws from the marks' rules and
   nothing of its own but the box: the mark on the page and this are one
   object seen twice, so the moment they are styled apart they stop being one. */
.mk-rowleaf {
  position: relative;
  flex: none;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
}

/* The number holds the share of the leaf it holds on the page — 11 in 38 —
   rather than a size of its own, which at row scale outgrew the shape. */
.mk-rowleaf .mk-mark-n {
  --mk-n: 8.5px;
}
`.trim();
}

function rowDetail(): string {
  return `
/* The reviewer's colour, on the name rather than on a shape of its own: the
   only leaf in the row belongs to the comment, and a second one beside it drew
   two different sentences with one drawing. */
.mk-name {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  font-weight: 600;
}

.mk-name::before {
  content: "";
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--mk-slot, var(--mk-accent));
}

/* Hollow, then dashed: the same ladder the leaf draws provenance with, in the
   one mark small enough to sit inside a line of text. */
.mk-name[data-provenance="client"]::before {
  background: color-mix(in oklab, var(--mk-slot, var(--mk-accent)) 40%, transparent);
  box-shadow: inset 0 0 0 1px var(--mk-slot, var(--mk-accent));
}

.mk-name[data-provenance="guest"]::before {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px var(--mk-slot, var(--mk-accent));
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
  border-radius: var(--mk-r-xs);
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

/** Import, and the row that says drafts are saved under another branch. */
function transfer(): string {
  return `
.mk-transfer {
  flex: none;
  display: flex;
  gap: 6px;
}

.mk-icon-btn {
  position: relative;
  flex: none;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid var(--mk-line);
  border-radius: 999px;
  background: transparent;
  color: var(--mk-muted);
  cursor: pointer;
  transition:
    border-color var(--mk-dur-swap) var(--mk-ease-swap),
    background-color var(--mk-dur-swap) var(--mk-ease-swap),
    color var(--mk-dur-swap) var(--mk-ease-swap);
}

.mk-icon-btn:hover,
.mk-icon-btn[aria-pressed="true"],
.mk-icon-btn[aria-expanded="true"] {
  border-color: var(--mk-line-firm);
  background: var(--mk-sunk);
  color: var(--mk-fg);
}

/* The primary action of the group: the same box, in the green token. */
.mk-icon-btn-ok {
  border-color: color-mix(in srgb, var(--mk-ok) 45%, transparent);
  background: var(--mk-ok-sub);
  color: var(--mk-ok);
}

.mk-icon-btn-ok:hover {
  border-color: var(--mk-ok);
  background: var(--mk-ok-sub);
  color: var(--mk-ok);
}

.mk-icon-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

/* Something is saved here that cannot be published yet: carry it out. */
.mk-icon-dot {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  border: 1.5px solid var(--mk-bg);
  border-radius: 999px;
  background: var(--mk-ok);
}

.mk-transfer-other {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  padding: 6px 10px;
  border-top: 1px solid var(--mk-line);
  background: var(--mk-sunk);
  color: var(--mk-faint);
  font-size: 11px;
}

.mk-transfer-said {
  flex: 1 1 auto;
  min-width: 0;
}

.mk-transfer-said code {
  color: var(--mk-muted);
  font-family: inherit;
  font-weight: 600;
}

.mk-transfer-note {
  margin: 0;
  color: var(--mk-muted);
  font-size: 11px;
}

/* Under the status line, over the list: the card hides its overflow, so it
   stays inside the card. */
.mk-transfer-panel {
  position: absolute;
  z-index: 2;
  top: 100%;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 9px 9px;
  border-bottom: 1px solid var(--mk-line);
  background: var(--mk-sunk);
  box-shadow: var(--mk-sh2);
  color: var(--mk-faint);
  font-size: 11px;
}

.mk-transfer-box {
  box-sizing: border-box;
  width: 100%;
  resize: vertical;
  padding: 6px 8px;
  border: 1px solid var(--mk-line);
  border-radius: 6px;
  background: var(--mk-bg);
  color: var(--mk-fg);
  font: inherit;
  font-size: 11px;
}

.mk-transfer-row,
.mk-transfer-ask {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mk-transfer-file {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--mk-muted);
  font-size: 11px;
}

.mk-unsent-copy:disabled {
  opacity: 0.5;
  cursor: default;
}
`;
}

/** An action set in the sentence it follows, so it costs a word and not a button. */
function link(): string {
  return `
.mk-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--mk-accent);
  font: inherit;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

.mk-solo-command {
  min-width: 0;
  padding: 4px 8px;
  border-radius: var(--mk-r-xs);
  background: var(--mk-sunk);
  color: var(--mk-fg);
  font-family: var(--mk-mono);
  font-size: 11px;
  overflow-wrap: anywhere;
  user-select: all;
}
`;
}

/** The small pill button import shares, and a draft's row in the list. */
function ledger(): string {
  return `
.mk-unsent-copy {
  flex: none;
  padding: 2px 8px;
  border: 1px solid var(--mk-line);
  border-radius: 999px;
  background: transparent;
  color: var(--mk-muted);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.mk-draft-row {
  position: relative;
  cursor: pointer;
}

.mk-draft-row .mk-rowleaf .mk-mark-n {
  display: none;
}

/* A draft is not a stored comment: there is nothing yet to resolve. */
.mk-draft-row .mk-quick {
  display: none;
}

.mk-draft-drop {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 6px;
  border: 0;
  background: transparent;
  color: var(--mk-faint);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
}

.mk-draft-drop:hover {
  color: var(--mk-fg);
}
`.trim();
}

/** The sign-off, a green check in the toolbar group. */
function approve(): string {
  return `
/* Until it is given the check wears the group's green; once given it is a
   neutral pressed button. Signed out it is disabled. */
.mk-approve:disabled {
  cursor: not-allowed;
}
`.trim();
}

function newComment(): string {
  return `
/* One row, not a label over a row: the label is two syllables and the three
   picks it introduces are beside it, which is half the height for the same
   sentence. */
.mk-new {
  flex: none;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 8px;
  border-top: 1px solid var(--mk-line);
  background: var(--mk-sunk);
}

.mk-new-label {
  flex: none;
  color: var(--mk-faint);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.mk-picks {
  display: flex;
  flex: 1 1 auto;
  gap: 4px;
}

.mk-pick {
  flex: 1 1 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 3px 8px;
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
    transform: translateY(var(--mk-rise-card)) scale(var(--mk-scale-island));
  }
}

@keyframes mk-island-out {
  to {
    opacity: 0;
    transform: translateY(var(--mk-rise-row)) scale(var(--mk-scale-island));
  }
}

@keyframes mk-pop-in {
  from {
    opacity: 0;
    transform: translateY(calc(-1 * var(--mk-rise-row))) scale(var(--mk-scale-tooltip));
  }
}

@keyframes mk-row-in {
  from {
    opacity: 0;
    transform: translateY(var(--mk-rise-row));
  }
}
`.trim();
}
