/**
 * The mock box's and the banner's rules.
 *
 * Composed into the overlay's sheet by `src/stylesheet.ts`, and into the box's
 * own sheet by `sheet.ts`, so the box looks the same inside `<Maple />` and on
 * a page that only mocks. Built from the token contract like every other part.
 */

import { SHEET_BREAKPOINT_PX } from "../tokens.js";

/** Every rule the box and the banner need, and nothing another part owns. */
export function mockCss(): string {
  return [box(), suggest(), calls(), states(), menu(), foot(), banner()].join("\n\n");
}

function box(): string {
  return `
.mk-mock {
  position: absolute;
  top: 12vh;
  left: 50%;
  width: min(560px, calc(100vw - 24px));
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  translate: -50% 0;
  animation: mk-mock-in var(--mk-dur-island-open) var(--mk-ease-surface);
}

@keyframes mk-mock-in {
  from {
    opacity: 0;
    translate: -50% calc(-1 * var(--mk-rise-card));
  }
}

.mk-mock-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--mk-line);
}

.mk-mock-field {
  flex: 1 1 auto;
  min-width: 0;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: var(--mk-fg);
  font: inherit;
  font-size: 14px;
}

.mk-mock-field:focus-visible {
  outline: none;
}

.mk-mock-field::placeholder {
  color: var(--mk-faint);
}

.mk-mock-key-hint {
  flex: none;
  padding: 1px 5px;
  border: 1px solid var(--mk-line-firm);
  border-radius: var(--mk-r-xs);
  color: var(--mk-faint);
  font-size: 10.5px;
}

.mk-mock-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.mk-mock-route {
  flex: none;
  margin: 0;
  padding: 10px 12px 4px;
  color: var(--mk-muted);
  font-size: 11px;
  font-weight: 600;
}

.mk-mock-route .mk-mono {
  color: var(--mk-fg);
  font-weight: 400;
}

.mk-mock-fold {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  border: 0;
  background: transparent;
  font-family: inherit;
  cursor: pointer;
}

.mk-mock-fold[aria-expanded="true"] svg {
  rotate: 180deg;
}

.mk-mock-empty {
  margin: 0;
  padding: 14px 12px 16px;
  color: var(--mk-muted);
  text-wrap: pretty;
}
`.trim();
}

/** A sentence the route is reading draws a sweep along the field's edge. */
function suggest(): string {
  return `
.mk-mock-head {
  position: relative;
}

.mk-mock-head[data-mk-thinking="true"]::after {
  content: "";
  position: absolute;
  inset: auto 0 -1px;
  height: 2px;
  background: radial-gradient(closest-side, var(--mk-accent), transparent);
  animation: mk-mock-sweep var(--mk-dur-shimmer) var(--mk-ease-swap) infinite;
}

@keyframes mk-mock-sweep {
  from {
    translate: calc(-1 * var(--mk-shimmer-sweep)) 0;
  }
  to {
    translate: var(--mk-shimmer-sweep) 0;
  }
}

.mk-mock-unnamed {
  flex: none;
  margin: 0;
  padding: 8px 12px 0;
  color: var(--mk-muted);
  font-size: 12px;
}
`.trim();
}

function calls(): string {
  return `
.mk-mock-calls {
  margin: 0;
  padding: 4px 6px 6px;
  list-style: none;
}

.mk-mock-call {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  padding: 6px;
  border-radius: var(--mk-r-sm);
}

.mk-mock-call[data-mk-mocked="true"] {
  background: var(--mk-warn-sub);
}

.mk-mock-name {
  flex: 1 1 160px;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  overflow: hidden;
  color: var(--mk-muted);
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.mk-mock-codec {
  flex: none;
  color: var(--mk-faint);
  font-size: 10px;
  text-transform: uppercase;
}

.mk-mock-rung {
  flex: none;
  padding: 0 6px;
  border: 1px solid var(--mk-line);
  border-radius: 999px;
  color: var(--mk-faint);
  font-size: 10px;
  white-space: nowrap;
}

.mk-mock-call[data-mk-mocked="true"] .mk-mock-name {
  color: var(--mk-fg);
}

.mk-mock-call[data-mk-seen="false"] .mk-mock-name {
  color: var(--mk-faint);
}
`.trim();
}

function states(): string {
  return `
.mk-mock-states {
  flex: 0 1 auto;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 1px;
  margin-left: auto;
  padding: 2px;
  border-radius: var(--mk-r-sm);
  background: var(--mk-sunk);
}

.mk-mock-state {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 7px;
  border: 0;
  border-radius: var(--mk-r-xs);
  background: transparent;
  color: var(--mk-muted);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  transition:
    background-color var(--mk-dur-fade) var(--mk-ease-surface),
    color var(--mk-dur-fade) var(--mk-ease-surface);
}

.mk-mock-state:hover {
  color: var(--mk-fg);
}

.mk-mock-state[aria-checked="true"] {
  background: var(--mk-fg);
  color: var(--mk-bg);
  font-weight: 600;
}
`.trim();
}

/** The pick for a call's state, and the menu it opens in the top layer. */
function menu(): string {
  return `
.mk-mock-pick,
.mk-mock-item {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 0;
  background: transparent;
  color: var(--mk-fg);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.mk-mock-pick {
  flex: none;
  gap: 4px;
  min-width: 80px;
  margin-left: auto;
  padding: 1px 4px 1px 8px;
  border-radius: 999px;
  background: var(--mk-fg);
  color: var(--mk-bg);
  font-size: 11px;
  line-height: 15px;
  font-weight: 600;
}

.mk-mock-chevron {
  margin-left: auto;
  opacity: 0.6;
}

.mk-mock-menu {
  position: fixed;
  inset: 0 auto auto 0;
  margin: 0;
  translate: var(--mk-x) var(--mk-y);
  min-width: 132px;
  padding: 3px;
  border: 1px solid var(--mk-line-firm);
  border-radius: var(--mk-r);
  background: var(--mk-bg);
  box-shadow: var(--mk-sh2);
}

.mk-mock-item {
  width: 100%;
  padding: 5px 8px;
  border-radius: var(--mk-r-sm);
}

.mk-mock-item:hover,
.mk-mock-item:focus-visible {
  outline: none;
  background: var(--mk-sunk);
}

.mk-mock-item[aria-checked="true"] {
  font-weight: 600;
}

.mk-mock-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--mk-ok);
}
`.trim();
}

function foot(): string {
  return `
.mk-mock-foot {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-top: 1px solid var(--mk-line);
}

.mk-mock-spacer {
  flex: 1 1 auto;
}

.mk-mock-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  border: 1px solid var(--mk-line-firm);
  border-radius: 999px;
  background: var(--mk-bg);
  color: var(--mk-fg);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.mk-mock-button[data-mk-quiet="true"] {
  border-color: transparent;
  background: transparent;
  color: var(--mk-muted);
}

.mk-mock-button[data-mk-quiet="true"]:hover:not(:disabled) {
  color: var(--mk-fg);
}

.mk-mock-button:disabled {
  color: var(--mk-faint);
  cursor: default;
}

.mk-mock-button[data-mk-primary="true"] {
  border-color: var(--mk-accent);
  background: var(--mk-accent);
  color: var(--mk-accent-ink);
  font-weight: 600;
}

.mk-mock-button[data-mk-primary="true"]:disabled {
  opacity: 0.4;
}
`.trim();
}

/** Always on while a mock is: it cannot be dismissed, only turned off. */
function banner(): string {
  return `
.mk-mock-banner {
  position: absolute;
  bottom: 12px;
  left: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  width: max-content;
  max-width: calc(100vw - 160px);
  padding: 4px 4px 4px 12px;
  border: 1px solid var(--mk-warn);
  border-radius: 999px;
  background: var(--mk-warn-sub);
  box-shadow: var(--mk-sh1);
  color: var(--mk-fg);
  font-size: 12px;
}

.mk-mock-banner-said {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.mk-mock-banner-as {
  white-space: normal;
}

.mk-mock-banner .mk-mock-button {
  flex: none;
  padding: 3px 10px;
  font-size: 11.5px;
}

@media (max-width: ${String(SHEET_BREAKPOINT_PX - 1)}px) {
  .mk-mock-banner {
    bottom: 56px;
    left: 50%;
    translate: -50% 0;
    flex-wrap: wrap;
    max-width: calc(100vw - 24px);
    border-radius: var(--mk-r);
  }
}
`.trim();
}
