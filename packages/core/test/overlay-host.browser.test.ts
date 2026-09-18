import { afterEach, describe, expect, it } from "vitest";

import { createOverlayHost, createOverlayStyleSheet } from "../src/overlay/index.js";

import type { OverlayHost } from "../src/overlay/index.js";

let host: OverlayHost | undefined;

afterEach(() => {
  host?.destroy();
  host = undefined;
});

describe("the overlay host", () => {
  it("marks itself, so nothing anchors to it", () => {
    host = createOverlayHost();
    expect(host.container.hasAttribute("data-maple-overlay")).toBe(true);
  });

  it("covers the viewport without swallowing a click", () => {
    host = createOverlayHost();
    const style = getComputedStyle(host.container);

    expect(style.position).toBe("fixed");
    expect(style.pointerEvents).toBe("none");
  });

  it("puts its UI behind a shadow root, so the page's CSS cannot reach it", () => {
    host = createOverlayHost();
    expect(host.root).toBeInstanceOf(ShadowRoot);
    expect(host.container.shadowRoot).toBe(host.root);
  });

  it("takes styles only as adopted stylesheets, never as a style element", () => {
    host = createOverlayHost();
    host.addStyles(":host { color: rebeccapurple }");

    expect(host.root.adoptedStyleSheets).toHaveLength(1);
    expect(host.root.querySelector("style")).toBeNull();
  });

  it("keeps stylesheets already adopted when another is added", () => {
    host = createOverlayHost();
    host.addStyles(":host { color: red }");
    host.addStyles(":host { color: blue }");

    expect(host.root.adoptedStyleSheets).toHaveLength(2);
  });

  it("carries a nonce when a host mounts it with a script tag", () => {
    host = createOverlayHost({ nonce: "abc123" });
    expect(host.container.getAttribute("nonce")).toBe("abc123");
  });

  it("leaves nothing behind when destroyed", () => {
    const created = createOverlayHost();
    created.destroy();

    expect(document.querySelector("[data-maple-overlay]")).toBeNull();
  });

  it("builds a stylesheet the CSSOM accepts", () => {
    const sheet = createOverlayStyleSheet(".pin { color: red }");
    expect(sheet.cssRules).toHaveLength(1);
  });
});
