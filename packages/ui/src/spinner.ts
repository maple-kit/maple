/**
 * The loader, and the one rule about when a button wears it.
 *
 * A circle drawn with borders rather than an icon: it is two lines of CSS in
 * the shared sheet and no module of its own. `useBusy` is the per-button half:
 * the button that was pressed spins and is disabled until its own call ends.
 */

import { createElement, useCallback, useState } from "react";

import type { ReactElement, ReactNode } from "react";

/** A spinning ring. It sizes to the button or the header it sits in. */
export function Spinner(): ReactElement {
  return createElement("span", { className: "mk-spin", "aria-hidden": "true" });
}

/** A text button's children while it works: the ring first, then the words. */
export function spun(label: ReactNode): ReactNode {
  return [createElement(Spinner, { key: "spin" }), label];
}

/** Whether this control's own call is out, and the way to start one. */
export function useBusy(): readonly [boolean, (work: () => Promise<unknown>) => void] {
  const [busy, setBusy] = useState(false);

  const run = useCallback((work: () => Promise<unknown>): void => {
    setBusy(true);
    void work()
      .catch(() => undefined)
      .finally(() => setBusy(false));
  }, []);

  return [busy, run];
}
