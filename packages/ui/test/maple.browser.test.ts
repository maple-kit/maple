import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { Maple } from "../src/maple.js";
import { offlineFetch } from "./offline.js";

import type { ReactElement } from "react";

const BRANCH = "feat/ui-composition";

/** The whole call site an application writes, which is the point of this part. */
function tree(props: { readonly defaultOpen?: boolean } = {}): ReactElement {
  return createElement(Maple, {
    branch: BRANCH,
    theme: "light",
    options: { fetch: offlineFetch() },
    ...props,
  });
}

function root(): ShadowRoot {
  const host = document.querySelector<HTMLElement>("[data-maple-overlay]");
  if (!host?.shadowRoot) throw new Error("no overlay is mounted");
  return host.shadowRoot;
}

function find<T extends Element>(selector: string): T {
  const found = root().querySelector<T>(selector);
  if (!found) throw new Error(`nothing matched ${selector}`);
  return found;
}

beforeEach(async () => {
  localStorage.clear();
  document.documentElement.setAttribute("data-theme", "light");
  await page.viewport(1100, 760);
});

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  for (const overlay of document.querySelectorAll("[data-maple-overlay]")) overlay.remove();
});

/**
 * The parts exist so a design system can replace them one at a time. Most
 * applications replace none, and this is what those import.
 */
describe("the default composition", () => {
  it("mounts one overlay from one element and one branch", async () => {
    await render(tree());

    await vi.waitFor(() =>
      expect(document.querySelectorAll("[data-maple-overlay]")).toHaveLength(1),
    );
    expect(root().querySelector(".mk-layer")).not.toBeNull();
  });

  it("brings the marks, the picker, the inventory and the composer", async () => {
    await render(tree({ defaultOpen: true }));
    await vi.waitFor(() => expect(root().querySelector(".mk-card")).not.toBeNull());

    expect(root().querySelector(".mk-marks")).not.toBeNull();
    expect(root().querySelector(".mk-composer")).not.toBeNull();
    expect(root().querySelector(".mk-filters")).not.toBeNull();
    expect(root().querySelectorAll(".mk-pick")).toHaveLength(3);
  });

  it("starts collapsed to its pill, because a page at rest carries one object", async () => {
    await render(tree());
    await vi.waitFor(() => expect(root().querySelector(".mk-pill")).not.toBeNull());

    expect(root().querySelector(".mk-card")).toBeNull();
  });

  it("wires the picker: arming from the island puts the shield up", async () => {
    await render(tree({ defaultOpen: true }));
    await vi.waitFor(() => expect(root().querySelector(".mk-card")).not.toBeNull());

    const element = [...root().querySelectorAll<HTMLButtonElement>("button")].find(
      (one) => one.textContent === "Element",
    );
    element?.click();

    await vi.waitFor(() => expect(root().querySelector(".mk-shield")).not.toBeNull());
    expect(find(".mk-pick-say").textContent).toBe("Click anything on the page");
  });

  it("carries the emoji control, which the parts do not add on their own", async () => {
    await render(tree({ defaultOpen: true }));

    await vi.waitFor(() => expect(root().querySelector(".mk-emoji-open")).not.toBeNull());
  });

  it("puts the settings, and therefore both preferences, in the header", async () => {
    await render(tree({ defaultOpen: true }));
    await vi.waitFor(() => expect(root().querySelector(".mk-card")).not.toBeNull());

    find<HTMLButtonElement>(".mk-iconbtn").click();

    await vi.waitFor(() => expect(root().querySelectorAll(".mk-seg-one")).toHaveLength(3));
    expect(root().querySelectorAll(".mk-corner")).toHaveLength(4);
  });
});
