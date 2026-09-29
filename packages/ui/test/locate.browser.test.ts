import { installSourceLocator } from "@maple-kit/core/anchor";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { targetFor } from "../src/picker/target.js";

import type { Pick } from "@maple-kit/core/overlay";

function pick(element: Element): Pick {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { kind: "element", element, rect: { x, y, width, height } };
}

function Heading() {
  return createElement("h1", null, "Located by its owner stack");
}

/** The real thing: React in development, and the source map this dev server serves inline. */
describe("targetFor on a page nothing tagged", () => {
  it("records the file and line React's owner stack leads to, and says how", async () => {
    const screen = await render(createElement(Heading));
    const element = screen.container.querySelector("h1")!;

    await installSourceLocator().warm();
    const { anchor } = targetFor(pick(element))!;

    expect(anchor.source).toMatch(/packages\/ui\/test\/locate\.browser\.test\.ts:\d+:\d+$/);
    expect(anchor).toMatchObject({ component: "Heading", locatedBy: "owner-stack" });
  });

  it("names the tagger when the element carries one", async () => {
    const screen = await render(
      createElement("h1", { "data-maple-src": "app/page.tsx:3:5" }, "Tagged"),
    );

    const { anchor } = targetFor(pick(screen.container.querySelector("h1")!))!;

    expect(anchor).toMatchObject({ source: "app/page.tsx:3:5", locatedBy: "tagger" });
  });

  it("records no location for an element nothing can place", async () => {
    const screen = await render(createElement("p", null, "Plain"));
    const element = document.createElement("p");
    element.textContent = "Not React's";
    screen.container.append(element);

    const { anchor } = targetFor(pick(element))!;

    expect(anchor.source).toBeUndefined();
    expect(anchor.locatedBy).toBeUndefined();
  });
});
