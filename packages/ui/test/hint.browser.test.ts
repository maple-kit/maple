import { commentModifier } from "@maple-kit/core/client";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { MapleRoot } from "../src/index.js";
import { Island, IslandHint, IslandTrigger } from "../src/island/index.js";
import { BRANCH, refusingFetch } from "./fixtures.js";

function hint(): HTMLElement | null {
  const host = document.querySelector<HTMLElement>("[data-maple-overlay]");
  return host?.shadowRoot?.querySelector<HTMLElement>(".mk-tap-hint") ?? null;
}

function tap(target: EventTarget): void {
  const key = commentModifier();
  const flag = key === "Meta" ? { metaKey: true } : { altKey: true };
  const init = { key, bubbles: true, composed: true };
  target.dispatchEvent(new KeyboardEvent("keydown", { ...init, ...flag }));
  target.dispatchEvent(new KeyboardEvent("keyup", init));
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  for (const node of document.querySelectorAll("[data-maple-overlay]")) node.remove();
});

describe("a tap a text field swallowed", () => {
  it("says where to click, in one line, and only then", async () => {
    await render(
      createElement(
        MapleRoot,
        { branch: BRANCH, theme: "light", options: { fetch: refusingFetch({ status: 200 }) } },
        createElement(Island, null, createElement(IslandHint), createElement(IslandTrigger)),
      ),
    );
    expect(hint()).toBeNull();

    const field = document.createElement("input");
    document.body.append(field);
    field.focus();
    tap(field);

    await vi.waitFor(() => expect(hint()?.textContent).toMatch(/^Typing .* click the page/));
    field.remove();
  });
});
