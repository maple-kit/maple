/**
 * The sign-in steps' half of the adopted stylesheet, apart from the component
 * for the same reason as `popup-css.ts`.
 */

/** The steps' rules. Composed by `src/stylesheet.ts`. */
export function signInCss(): string {
  return `
.mk-steps {
  display: grid;
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: mk-step;
}

.mk-steps li {
  position: relative;
  display: grid;
  gap: 6px;
  padding-left: 26px;
  counter-increment: mk-step;
}

.mk-steps li::before {
  content: counter(mk-step);
  position: absolute;
  top: 0;
  left: 0;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--mk-accent);
  color: var(--mk-accent-ink);
  font-size: 10.5px;
  font-weight: 700;
}

.mk-step-said {
  font-weight: 600;
}

.mk-code-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
}

.mk-steps .mk-code-row {
  margin-top: 0;
}

.mk-step-code {
  padding: 4px 9px;
  border-radius: var(--mk-r-xs);
  background: var(--mk-sunk);
  font-family: var(--mk-mono);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.1em;
  user-select: all;
}

.mk-step-open {
  justify-self: start;
  padding: 5px 12px;
  border-radius: 999px;
  background: var(--mk-accent);
  color: var(--mk-accent-ink);
  font-size: 11.5px;
  font-weight: 650;
  text-decoration: none;
}

.mk-popup-body .mk-step-wait {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--mk-line);
  font-size: 11px;
}

.mk-step-dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--mk-accent);
  animation: mk-step-pulse var(--mk-dur-shimmer) var(--mk-ease-swap) infinite;
}

@keyframes mk-step-pulse {
  50% {
    opacity: 0.25;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mk-step-dot {
    animation: none;
  }
}
`.trim();
}
