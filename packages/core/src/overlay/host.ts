/**
 * Where the overlay lives in the page.
 *
 * Two constraints, both from docs/overlay-csp.md. Styles enter only through a
 * constructed stylesheet, because an injected `<style>` inside a shadow root is
 * still an inline style and still needs `style-src 'unsafe-inline'`. And
 * positions are set with `setProperty`, never by assigning `cssText`, which is
 * the one CSSOM call that is CSP-checked.
 */

import { OVERLAY_MARKER } from "../anchor/text-position.js";

/** A mounted overlay root. */
export interface OverlayHost {
  /** Where the overlay's own UI is rendered. */
  readonly root: ShadowRoot;
  /** The element in the page that carries the shadow root. */
  readonly container: HTMLElement;
  /** Adds a stylesheet to the shadow root. The only way styles get in. */
  addStyles(css: string): void;
  /** Removes the overlay and everything in it. */
  destroy(): void;
}

/** How the host is mounted. */
export interface OverlayHostOptions {
  /** Where to mount. Defaults to `document.body`. */
  readonly parent?: Element;
  /**
   * Nonce for a host that mounts Maple with a script tag. A bundled component
   * inherits the application's own and needs none.
   */
  readonly nonce?: string;
}

/** Builds an adoptable stylesheet, the only styling path the overlay may use. */
export function createOverlayStyleSheet(css: string): CSSStyleSheet {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  return sheet;
}

/** Mounts the overlay's root into the page. */
export function createOverlayHost(options: OverlayHostOptions = {}): OverlayHost {
  const parent = options.parent ?? document.body;
  const container = document.createElement("div");

  container.setAttribute(OVERLAY_MARKER, "");
  if (options.nonce !== undefined) container.setAttribute("nonce", options.nonce);
  pin(container);

  const root = container.attachShadow({ mode: "open" });
  parent.append(container);

  return {
    root,
    container,
    addStyles(css: string) {
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, createOverlayStyleSheet(css)];
    },
    destroy() {
      container.remove();
    },
  };
}

/**
 * The container covers the viewport and lets every event through; the overlay's
 * own controls turn pointer events back on for themselves.
 */
function pin(container: HTMLElement): void {
  const style = container.style;
  style.setProperty("position", "fixed");
  style.setProperty("inset", "0");
  style.setProperty("pointer-events", "none");
  style.setProperty("z-index", "2147483647");
}
