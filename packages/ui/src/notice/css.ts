/**
 * The notice's half of the adopted stylesheet.
 *
 * One band, tinted by the kind. It sits in the flow rather than over anything:
 * a failure covered by a toast that leaves after four seconds is a failure a
 * reviewer has to catch, and nothing here is in a hurry.
 */

/** The notice's rules. Composed by `src/stylesheet.ts`, never imported alone. */
export function noticeCss(): string {
  return `
.mk-notice {
  flex: none;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 9px 8px 11px;
  border-bottom: 1px solid var(--mk-line);
  background: var(--mk-warn-sub);
  color: var(--mk-fg);
  font-size: 11.5px;
  line-height: 1.4;
  animation: mk-notice-in var(--mk-dur-swap) var(--mk-ease-surface);
}

@keyframes mk-notice-in {
  from {
    opacity: 0;
    translate: 0 calc(-1 * var(--mk-rise-row));
  }
}

/* A 401 is a door, not a fault: the reviewer signs in and it is gone. The
   warm tint is for the ones nobody on this page can do anything about. */
.mk-notice[data-mk-kind="unauthorized"] {
  background: var(--mk-info-sub);
}

.mk-notice-said {
  flex: 1 1 auto;
  text-wrap: pretty;
}

/* The island header's own close button, so the two sit on the same inset and
   share a size; the negative margin keeps the band from growing to hold it. */
.mk-notice-off {
  margin: -5px 0 -5px auto;
}

/* In the composer it is the last thing above the buttons, so it closes the
   panel's bottom edge rather than cutting a line across it. */
.mk-composer .mk-notice {
  border-bottom: 0;
  border-top: 1px solid var(--mk-line);
}
`.trim();
}
