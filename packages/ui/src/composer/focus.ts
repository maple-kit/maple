/**
 * Focus across the composer's life. The panel turns `inert` on close, which
 * drops whatever it held to `<body>`, so a keyboard user would lose their place
 * in the page. The control focused when it opened is where focus goes back to.
 */

import { useLayoutEffect } from "react";

/** Remembers the page's focus when the composer opens and returns it on close. */
export function useRestoreFocus(open: boolean, overlay: Element): void {
  useLayoutEffect(() => {
    if (!open) return undefined;
    const doc = overlay.ownerDocument;
    let was = doc.activeElement;
    // Through any open shadow roots; Maple's own controls are not the page's.
    while (was?.shadowRoot?.activeElement) was = was.shadowRoot.activeElement;
    const page = overlay.shadowRoot?.contains(was) ? null : was;

    return () => {
      // Lost focus, or still Maple's: putting it back takes nothing from anyone.
      if (page?.isConnected && [null, doc.body, overlay].includes(doc.activeElement)) {
        (page as HTMLElement).focus({ preventScroll: true });
      }
    };
  }, [open, overlay]);
}
