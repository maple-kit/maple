import { afterEach, describe, expect, it, vi } from "vitest";

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

  it("mounts after <body>, so a transform on the body cannot re-anchor it", () => {
    document.body.style.setProperty("transform", "translateY(200px)");
    try {
      host = createOverlayHost();
      expect(host.container.parentNode).toBe(document.documentElement);
      expect(host.container.getBoundingClientRect().top).toBe(0);
    } finally {
      document.body.style.removeProperty("transform");
    }
  });

  it("is back in the document after the page swaps its body", async () => {
    host = createOverlayHost();
    const old = document.body;
    const next = document.createElement("body");
    old.replaceWith(next);
    try {
      await vi.waitFor(() => expect(host?.container.isConnected).toBe(true));
      expect(host.container.parentNode).toBe(document.documentElement);
    } finally {
      next.replaceWith(old);
    }
  });

  it("re-appends a host whose parent left the document", async () => {
    const parent = document.createElement("section");
    document.body.append(parent);
    host = createOverlayHost({ parent });
    parent.remove();

    await vi.waitFor(() => expect(host?.container.isConnected).toBe(true));
    expect(host.container.parentNode).toBe(document.documentElement);
  });

  it("builds a stylesheet the CSSOM accepts", () => {
    const sheet = createOverlayStyleSheet(".pin { color: red }");
    expect(sheet.cssRules).toHaveLength(1);
  });
});
