import { describe, expect, it } from "vitest";

import { createOverlayStyleSheet, DEFAULT_BASE_PATH } from "../src/overlay/index.js";

/**
 * Constructed stylesheets are the overlay's only styling path, and that can
 * only be checked in a real browser, so this suite runs in browser mode.
 */
describe("overlay styling", () => {
  it("mounts at /api/maple unless configured otherwise", () => {
    expect(DEFAULT_BASE_PATH).toBe("/api/maple");
  });

  it("builds an adoptable stylesheet without touching the DOM", () => {
    const sheet = createOverlayStyleSheet(":host { color: rebeccapurple; }");

    expect(sheet).toBeInstanceOf(CSSStyleSheet);
    expect(sheet.cssRules).toHaveLength(1);
  });

  it("produces a sheet a shadow root can adopt", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = host.attachShadow({ mode: "open" });

    root.adoptedStyleSheets = [createOverlayStyleSheet(":host { display: block; }")];

    expect(root.adoptedStyleSheets).toHaveLength(1);
    host.remove();
  });
});
