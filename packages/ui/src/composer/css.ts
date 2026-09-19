/**
 * The composer's rules, kept out of `stylesheet.ts` so three parts can be
 * built at once without three agents editing one file.
 *
 * Every duration and easing here is a token, so reduced motion reaches the
 * panel with everything else. The sheet is not a variant: below
 * `SHEET_BREAKPOINT_PX` the same element takes `--mk-composer-w` at 100% and
 * `--mk-composer-r` from the base sheet, and slides up instead of across.
 */

import { SHEET_BREAKPOINT_PX } from "../tokens.js";

/** The width the sheet takes over at, as the media query spells it. */
const NARROW = `@media (max-width: ${SHEET_BREAKPOINT_PX - 1}px)`;

/**
 * The panel, its two detents as a sheet, and the five parts inside it.
 *
 * Interruptible throughout: state changes are transitions rather than
 * keyframes, so a close that interrupts an open reverses from where it is.
 */
export function composerCss(): string {
  return `
${shellCss()}

${partsCss()}

${controlCss()}

${NARROW} {
${sheetCss()}
}
`.trim();
}

function shellCss(): string {
  return `
.mk-composer {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 11px;
  overflow-x: hidden;
  overflow-y: auto;
  width: var(--mk-composer-w);
  max-width: 100%;
  border-radius: var(--mk-composer-r);
  border-left: 1px solid var(--mk-line-firm);
  background: var(--mk-bg);
  box-shadow: var(--mk-sh3);
  opacity: 0;
  transform: translateX(var(--mk-shift-composer));
  pointer-events: none;
  transition:
    opacity var(--mk-dur-composer-close) var(--mk-ease-surface),
    transform var(--mk-dur-composer-close) var(--mk-ease-surface);
}

:host([data-mk-scheme="dark"]) .mk-composer {
  box-shadow: var(--mk-sh3), inset 0 1px 0 oklch(1 0 0 / 0.045);
}

.mk-composer[data-mk-open="true"] {
  opacity: 1;
  transform: translateX(0);
  pointer-events: auto;
  transition:
    opacity var(--mk-dur-composer-open) var(--mk-ease-surface),
    transform var(--mk-dur-composer-open) var(--mk-ease-surface);
}

.mk-composer[data-mk-moving="true"] {
  will-change: transform, opacity;
}

.mk-composer[data-mk-open="true"][data-mk-peek="true"] {
  opacity: 0.08;
  pointer-events: none;
  transition: opacity var(--mk-dur-fade) var(--mk-ease-surface);
}

.mk-composer-head {
  position: sticky;
  top: 0;
  z-index: 1;
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--mk-line);
  background: var(--mk-bg);
}

.mk-composer-fill {
  flex: 1 1 auto;
}

.mk-composer-row {
  flex: none;
  margin: 0 12px;
}

.mk-composer-foot {
  position: sticky;
  bottom: 0;
  margin-top: auto;
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-top: 1px solid var(--mk-line);
  background: var(--mk-sunk);
}

.mk-grab {
  display: none;
}
`.trim();
}

/**
 * The control in the field's corner, the grid it opens, and the menu a `:`
 * shortcode opens over the field's bottom edge. One grid, drawn twice.
 */
function emojiCss(): string {
  return `
.mk-emoji {
  position: absolute;
  right: 6px;
  bottom: 6px;
}

.mk-emoji-open {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: var(--mk-r-xs);
  background: transparent;
  color: var(--mk-faint);
  font: inherit;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color var(--mk-dur-swap) var(--mk-ease-swap),
    color var(--mk-dur-swap) var(--mk-ease-swap);
}

.mk-emoji-open:hover,
.mk-emoji-open[aria-expanded="true"] {
  background: var(--mk-sunk);
  color: var(--mk-fg);
}

.mk-emoji-grid {
  position: absolute;
  right: 0;
  bottom: calc(100% + 6px);
  z-index: 6;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 1px;
  padding: 5px;
  border: 1px solid var(--mk-line-firm);
  border-radius: var(--mk-r-sm);
  background: var(--mk-bg);
  box-shadow: var(--mk-sh2);
  transform-origin: bottom right;
  animation: mk-pop-in var(--mk-dur-tooltip) var(--mk-ease-surface);
}

/* The shortcode menu is the same grid against the field rather than against
   the control, because it belongs to the word being typed. */
.mk-emoji-menu {
  right: auto;
  left: 8px;
  bottom: auto;
  top: calc(100% - 2px);
  grid-template-columns: repeat(auto-fit, 26px);
  transform-origin: top left;
}

.mk-emoji-one {
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: var(--mk-r-xs);
  background: transparent;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  transition: background-color var(--mk-dur-swap) var(--mk-ease-swap);
}

.mk-emoji-one:hover,
.mk-emoji-one[aria-selected="true"] {
  background: var(--mk-sunk);
}

.mk-emoji-one[aria-selected="true"] {
  box-shadow: inset 0 0 0 1px var(--mk-line-firm);
}
`.trim();
}

/** What the page looked like, and the screenshot taken of it. */
function contextAndShots(): string {
  return `
.mk-ctx {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 5px 14px;
  margin: 0;
  padding: 9px 11px;
  border: 1px solid var(--mk-line);
  border-radius: var(--mk-r-sm);
  background: var(--mk-sunk);
}

.mk-ctx dt {
  align-self: baseline;
  color: var(--mk-faint);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  white-space: nowrap;
}

.mk-ctx dd {
  margin: 0;
  color: var(--mk-fg);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.mk-ctx dd em {
  color: var(--mk-muted);
  font-style: normal;
}

.mk-ctx dd.mk-mono {
  font-size: 11px;
  word-break: break-all;
}

/* Dashed, because nobody asked for what is inside it: the shot arrives on its
   own at pick time, and a dashed edge is how this surface already says
   "provisional" — it is what an unsent comment's mark is drawn with. */
.mk-shots {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 9px;
  border: 1px dashed var(--mk-line-firm);
  border-radius: var(--mk-r-sm);
}

.mk-shots img {
  display: block;
  flex: none;
  width: 72px;
  height: 46px;
  object-fit: cover;
  object-position: top;
  border-radius: var(--mk-r-xs);
}

/* The strip says where its image came from, or how to put one there. It is a
   sentence, not a chip: a chip is a fact, and this is an instruction. */
.mk-shot-said {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--mk-faint);
  font-size: 11px;
  line-height: 1.4;
  text-wrap: pretty;
}

.mk-shot-said svg {
  flex: none;
  color: var(--mk-accent);
}
`.trim();
}

function partsCss(): string {
  return `
.mk-target {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

/* The icon is optically centred, not box-centred: its 16-unit box has more
   air under the glyph than over it, so the square needs the difference back. */
.mk-target-kind {
  display: grid;
  place-items: center;
  flex: none;
  width: 22px;
  height: 22px;
  border: 1px solid var(--mk-line);
  border-radius: var(--mk-r-xs);
  background: var(--mk-sunk);
  color: var(--mk-muted);
  line-height: 0;
}

.mk-target-kind svg {
  display: block;
}

.mk-target-on {
  font-size: 12px;
  color: var(--mk-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mk-target-on b {
  color: var(--mk-fg);
  font-weight: 600;
}

/* The passage itself, quoted: a reviewer who selected six words reads those
   six words back rather than the name of the paragraph they were in. */
.mk-target-quote {
  color: var(--mk-fg);
  font-style: italic;
  font-weight: 500;
}

.mk-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  padding: 1px 7px 1px 5px;
  border-radius: 999px;
  border: 1px solid var(--mk-line);
  background: var(--mk-sunk);
  color: var(--mk-muted);
  font-size: 10.5px;
  font-weight: 650;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

/* The field and the control in its corner are one box, so the focus ring goes
   round both and the caret never leaves the thing it is typing into. */
.mk-field-wrap {
  position: relative;
  display: flex;
}

.mk-field {
  flex: 1 1 auto;
  width: auto;
  min-height: 78px;
  padding: 8px 34px 8px 10px;
  resize: vertical;
  border: 1px solid var(--mk-line-firm);
  border-radius: var(--mk-r-sm);
  background: var(--mk-bg);
  color: var(--mk-fg);
  font-family: var(--mk-font);
  font-size: 13px;
  line-height: 1.5;
  outline: none;
  transition:
    border-color var(--mk-dur-fade) var(--mk-ease-surface),
    box-shadow var(--mk-dur-fade) var(--mk-ease-surface);
}

.mk-field:focus {
  border-color: var(--mk-accent);
  box-shadow: 0 0 0 3px color-mix(in oklab, var(--mk-accent) 22%, transparent);
}

/* A comment already written is read, not edited: one body per comment, so
   there is no field here to put a caret in. */
.mk-read {
  margin: 0 12px;
  padding: 0;
  color: var(--mk-fg);
  font-size: 13.5px;
  line-height: 1.62;
  text-wrap: pretty;
}

${emojiCss()}

${contextAndShots()}

.mk-leave {
  position: absolute;
  top: 12px;
  left: 50%;
  z-index: 3;
  max-width: calc(100% - 24px);
  padding: 11px 13px;
  border: 1px solid var(--mk-line-firm);
  border-radius: var(--mk-r);
  background: var(--mk-bg);
  box-shadow: var(--mk-sh3);
  opacity: 0;
  transform: translateX(-50%) scale(var(--mk-scale-island));
  pointer-events: none;
  transition:
    opacity var(--mk-dur-island-close) var(--mk-ease-surface),
    transform var(--mk-dur-island-close) var(--mk-ease-surface);
}

.mk-leave[data-mk-open="true"] {
  opacity: 1;
  transform: translateX(-50%) scale(1);
  pointer-events: auto;
  transition:
    opacity var(--mk-dur-island-open) var(--mk-ease-surface),
    transform var(--mk-dur-island-open) var(--mk-ease-surface);
}

.mk-leave-say {
  margin: 0 0 9px;
  font-size: 12.5px;
  font-weight: 600;
}

.mk-leave-ask {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
`.trim();
}

function controlCss(): string {
  return `
.mk-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex: none;
  padding: 3px 8px;
  border: 1px solid var(--mk-line-firm);
  border-radius: var(--mk-r-sm);
  background: var(--mk-bg);
  color: var(--mk-fg);
  box-shadow: var(--mk-sh1);
  font-family: var(--mk-font);
  font-size: 11.5px;
  font-weight: 550;
  cursor: pointer;
  transition:
    background-color var(--mk-dur-fade) var(--mk-ease-surface),
    color var(--mk-dur-fade) var(--mk-ease-surface),
    filter var(--mk-dur-fade) var(--mk-ease-surface),
    transform var(--mk-dur-fade) var(--mk-ease-surface);
}

.mk-btn:hover {
  background: var(--mk-sunk);
}

.mk-btn[disabled] {
  opacity: 0.45;
  pointer-events: none;
}

.mk-btn-primary {
  border-color: transparent;
  background: var(--mk-accent);
  color: var(--mk-accent-ink);
}

.mk-btn-primary:hover {
  background: var(--mk-accent);
  filter: brightness(1.07);
}

.mk-btn-quiet {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
  color: var(--mk-muted);
}

.mk-btn-quiet:hover {
  background: var(--mk-sunk);
  color: var(--mk-fg);
}

.mk-shut {
  padding: 3px 7px;
  font-size: 12px;
  line-height: 1;
}
`.trim();
}

function sheetCss(): string {
  return `
  .mk-composer {
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 78%;
    border-left: 0;
    border-top: 1px solid var(--mk-line-firm);
    transform: translateY(var(--mk-shift-composer));
  }

  .mk-composer[data-mk-open="true"] {
    transform: translateY(0);
  }

  .mk-composer[data-mk-detent="half"] {
    max-height: 46%;
  }

  .mk-composer-head {
    top: 11px;
  }

  .mk-grab {
    position: sticky;
    top: 0;
    z-index: 2;
    display: block;
    flex: none;
    width: 34px;
    height: 4px;
    margin: 7px auto 0;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: var(--mk-line-firm);
    cursor: grab;
    touch-action: none;
  }
`.trimEnd();
}
