import { afterEach, describe, expect, it } from "vitest";

import { captureContext, formatContext } from "../src/overlay/index.js";

let mounted: HTMLElement | undefined;

function mount(html: string): HTMLElement {
  mounted = document.createElement("div");
  mounted.innerHTML = html;
  document.body.append(mounted);
  return mounted;
}

afterEach(() => {
  mounted?.remove();
  mounted = undefined;
});

describe("capturing the page's shape", () => {
  it("records the window and the content width separately", () => {
    const { viewport } = captureContext();
    expect(viewport.width).toBe(window.innerWidth);
    expect(viewport.contentWidth).toBe(document.documentElement.clientWidth);
    expect(viewport.dpr).toBe(window.devicePixelRatio);
  });

  it("records the scheme, locale and time zone", () => {
    const context = captureContext();
    expect(context.scheme).toMatch(/^(dark|light)$/);
    expect(context.locale).toBe(navigator.language);
    expect(context.timeZone).toBeTruthy();
  });

  it("names the first breakpoint that matches, so order decides", () => {
    const context = captureContext({
      breakpoints: [
        ["never", "(min-width: 99999px)"],
        ["always", "(min-width: 0px)"],
        ["also-always", "(min-width: 1px)"],
      ],
    });
    expect(context.breakpoint).toBe("always");
  });

  it("leaves the breakpoint out when none was configured", () => {
    expect(captureContext().breakpoint).toBeUndefined();
  });

  it("records an open dialog, with its width", () => {
    mount(`<div role="dialog" aria-label="Filters" style="width: 320px">x</div>`);
    const [region] = captureContext().regions;

    expect(region).toMatchObject({ role: "dialog", label: "Filters", width: 320 });
  });

  it("ignores a region too narrow to be a layout region", () => {
    mount(`<div role="dialog" style="width: 4px"></div>`);
    expect(captureContext().regions).toHaveLength(0);
  });

  it("takes the accessible name from aria-labelledby when there is no label", () => {
    mount(
      `<h2 id="t">Copilot</h2><aside role="complementary" aria-labelledby="t" style="width:400px">x</aside>`,
    );
    expect(captureContext().regions.some((region) => region.label === "Copilot")).toBe(true);
  });

  it("passes the application's own layout description through untouched", () => {
    const context = captureContext({ layout: () => ({ copilot: "open", width: 420 }) });
    expect(context.layout).toEqual({ copilot: "open", width: 420 });
  });

  it("records a timestamp that parses", () => {
    expect(Number.isNaN(Date.parse(captureContext().capturedAt))).toBe(false);
  });
});

describe("the badge", () => {
  it("reads as a sentence a reviewer can act on", () => {
    mount(`<div role="dialog" aria-label="Copilot" style="width: 420px">x</div>`);
    const badge = formatContext(captureContext({ breakpoints: [["lg", "(min-width: 0px)"]] }));

    expect(badge).toContain("window");
    expect(badge).toContain("content");
    expect(badge).toContain("lg");
    expect(badge).toContain("Copilot open");
  });

  it("leaves out what was not captured", () => {
    const badge = formatContext(captureContext());
    expect(badge.split(" · ")).toHaveLength(3);
  });
});
