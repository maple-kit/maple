/**
 * The card's resize handles. The size itself is two custom properties the
 * hook sets; this is only where the handles sit and what they look like.
 */

/** Handles on the sides facing away from the corner the card is pinned to. */
export function resizeCss(): string {
  return `
.mk-card[data-mk-sized] {
  width: var(--mk-card-w);
  height: var(--mk-card-h);
  max-height: calc(100vh - 24px);
}

.mk-resize {
  position: absolute;
  z-index: 6;
  touch-action: none;
}

.mk-resize::after {
  content: "";
  position: absolute;
  opacity: 0;
  border-radius: 999px;
  background: var(--mk-accent);
  transition: opacity var(--mk-dur-fade) var(--mk-ease-surface);
}

.mk-resize:hover::after,
.mk-resize:focus-visible::after {
  opacity: 0.7;
}

.mk-resize:focus-visible {
  outline: none;
}

.mk-resize[data-mk-resize="width"] {
  top: 14px;
  bottom: 14px;
  left: 0;
  width: 8px;
  cursor: ew-resize;
}

.mk-resize[data-mk-resize="width"]::after {
  top: 0;
  bottom: 0;
  left: 1px;
  width: 2px;
}

.mk-resize[data-mk-resize="height"] {
  top: 0;
  right: 14px;
  left: 14px;
  height: 8px;
  cursor: ns-resize;
}

.mk-resize[data-mk-resize="height"]::after {
  top: 1px;
  right: 0;
  left: 0;
  height: 2px;
}

.mk-resize[data-mk-resize="both"] {
  top: 0;
  left: 0;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
}

.mk-resize[data-mk-resize="both"]::after {
  top: 3px;
  left: 3px;
  width: 6px;
  height: 6px;
}

.mk-island[data-mk-corner$="left"] .mk-resize[data-mk-resize="width"],
.mk-island[data-mk-corner$="left"] .mk-resize[data-mk-resize="both"] {
  right: 0;
  left: auto;
}

.mk-island[data-mk-corner$="left"] .mk-resize[data-mk-resize="width"]::after {
  right: 1px;
  left: auto;
}

.mk-island[data-mk-corner$="left"] .mk-resize[data-mk-resize="both"]::after {
  right: 3px;
  left: auto;
}

.mk-island[data-mk-corner^="top"] .mk-resize[data-mk-resize="height"],
.mk-island[data-mk-corner^="top"] .mk-resize[data-mk-resize="both"] {
  top: auto;
  bottom: 0;
}

.mk-island[data-mk-corner^="top"] .mk-resize[data-mk-resize="height"]::after {
  top: auto;
  bottom: 1px;
}

.mk-island[data-mk-corner^="top"] .mk-resize[data-mk-resize="both"]::after {
  top: auto;
  bottom: 3px;
}

.mk-island[data-mk-corner="bottom-left"] .mk-resize[data-mk-resize="both"],
.mk-island[data-mk-corner="top-right"] .mk-resize[data-mk-resize="both"] {
  cursor: nesw-resize;
}
`.trim();
}
