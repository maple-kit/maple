/**
 * The picker's half of the adopted stylesheet.
 *
 * Two surfaces and a band. The shield is what gives element and region their
 * cursor and keeps a click off the island, so it exists for those two and not
 * for a passage: text under an overlay cannot be selected, whatever the
 * cursor over it says. Every value is a token, so reduced motion is honoured
 * by redefining the tokens rather than by switching these rules off.
 */

/** The picker's rules. Composed by `src/stylesheet.ts`, never imported alone. */
export function pickerCss(): string {
  return `
${shield()}

${band()}

${bar()}
`.trim();
}

/**
 * Transparent and over everything, so the page keeps its look. Pointer events
 * are on: the document listener hears the click, the island does not.
 */
function shield(): string {
  return `
.mk-shield {
  position: fixed;
  inset: 0;
  z-index: 3;
  pointer-events: auto;
  cursor: crosshair;
}

.mk-shield-drag {
  cursor: cell;
}
`.trim();
}

/** The rectangle as it is dragged. It is the ring's language, in a fill. */
function band(): string {
  return `
.mk-band {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 4;
  translate: var(--mk-x) var(--mk-y);
  width: var(--mk-w);
  height: var(--mk-h);
  border: 1.5px solid var(--mk-accent);
  border-radius: var(--mk-r-xs);
  background: color-mix(in oklab, var(--mk-accent) 12%, transparent);
  pointer-events: none;
}
`.trim();
}

/**
 * Top centre, because the island is bottom-anchored and a bar that shared its
 * corner would cover the thing it is explaining.
 */
function bar(): string {
  return `
.mk-pick-bar {
  position: fixed;
  top: 12px;
  left: 50%;
  translate: -50% 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: calc(100vw - 24px);
  padding: 6px 6px 6px 12px;
  border: 1px solid var(--mk-line-firm);
  border-radius: 999px;
  background: var(--mk-bg);
  box-shadow: var(--mk-sh2);
  color: var(--mk-fg);
  font: inherit;
  font-size: 12px;
  pointer-events: auto;
  animation: mk-pick-in var(--mk-dur-island-open) var(--mk-ease-entrance);
}

@keyframes mk-pick-in {
  from {
    opacity: 0;
    translate: -50% -6px;
  }
}

.mk-pick-say {
  font-weight: 600;
  white-space: nowrap;
}

.mk-pick-kinds {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  background: var(--mk-sunk);
}

.mk-pick-kind {
  padding: 2px 9px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--mk-muted);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  text-transform: capitalize;
  cursor: pointer;
  transition:
    background-color var(--mk-dur-swap) var(--mk-ease-swap),
    color var(--mk-dur-swap) var(--mk-ease-swap);
}

.mk-pick-kind[aria-pressed="true"] {
  background: var(--mk-bg);
  box-shadow: var(--mk-sh1);
  color: var(--mk-fg);
}

.mk-pick-stop {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border: 1px solid var(--mk-line);
  border-radius: 999px;
  background: transparent;
  color: var(--mk-muted);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.mk-pick-stop:hover {
  border-color: var(--mk-line-firm);
  color: var(--mk-fg);
}

.mk-kbd {
  padding: 0 4px;
  border: 1px solid var(--mk-line);
  border-radius: var(--mk-r-xs);
  background: var(--mk-sunk);
  font-family: var(--mk-mono);
  font-size: 10px;
  line-height: 15px;
}
`.trim();
}
