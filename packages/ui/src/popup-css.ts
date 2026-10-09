/**
 * The popup's half of the adopted stylesheet. Kept apart from `popup.ts` so the
 * sheet does not drag the component into the bundle that only adopts it.
 */

/** The popup's rules. Composed by `src/stylesheet.ts`. */
export function popupCss(): string {
  return `
.mk-popup {
  width: min(320px, calc(100vw - 24px));
  padding: 0;
  border: 1px solid var(--mk-line-firm);
  border-radius: var(--mk-r);
  background: var(--mk-bg);
  color: var(--mk-fg);
  box-shadow: var(--mk-sh3);
  font: inherit;
  font-size: 12px;
  line-height: 1.45;
  overflow: hidden;
  animation: mk-pop-in var(--mk-dur-tooltip) var(--mk-ease-surface);
}

.mk-popup:focus {
  outline: none;
}

.mk-popup::backdrop {
  background: oklch(0 0 0 / 0.28);
}

/* The same row the island's header is, so the two close controls sit on the
   same inset: 9px from the edge, 32 by 28. */
.mk-popup-head {
  display: flex;
  align-items: center;
  gap: 8px;
  height: var(--mk-head-h);
  padding: 0 9px 0 11px;
  border-bottom: 1px solid var(--mk-line);
}

.mk-popup-title {
  flex: 1 1 auto;
  margin: 0;
  font-size: 12.5px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.mk-popup-body {
  padding: 12px;
}

.mk-popup-body p {
  margin: 0;
  color: var(--mk-muted);
  text-wrap: pretty;
}
`.trim();
}
