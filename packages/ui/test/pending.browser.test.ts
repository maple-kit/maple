import { createMapleClient } from "@maple-kit/core/client";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { MapleActions } from "../src/composer/actions.js";
import { MapleComposer } from "../src/composer/composer.js";
import { MapleRoot } from "../src/index.js";
import { createMapleFake, fetchThrough, MAPLE_BASE } from "./msw/composer.js";

import type { MapleClient } from "@maple-kit/core/client";

const BRANCH = "feat/ui-pending";

let client: MapleClient;

afterEach(() => {
  client.destroy();
  localStorage.clear();
  for (const overlay of document.querySelectorAll("[data-maple-overlay]")) overlay.remove();
});

/** A route whose every write waits, so the in-flight state can be looked at. */
function slow(ms: number): typeof globalThis.fetch {
  const fake = fetchThrough(createMapleFake({ user: { id: "u_7", name: "Reviewer" } }).handlers);
  return async (input, init) => {
    if (
      init?.method === "POST" &&
      new URL(input instanceof Request ? input.url : input.toString()).pathname.endsWith(
        "/comments",
      )
    ) {
      await new Promise((done) => setTimeout(done, ms));
    }
    return fake(input, init);
  };
}

function shadow(): ShadowRoot {
  const host = document.querySelector("[data-maple-overlay]");
  if (!host?.shadowRoot) throw new Error("The overlay never mounted.");
  return host.shadowRoot;
}

describe("a text button while its call is out", () => {
  it("adds a ring to Publish and disables it until the store has answered", async () => {
    client = createMapleClient({
      branch: BRANCH,
      basePath: MAPLE_BASE,
      fetch: slow(400),
      debounceMs: 0,
    });
    client.start();
    await client.load();
    client.openComposer({ kind: "element", anchor: { component: "Card" }, label: "the card" });
    client.setBody("Too tight.");

    void render(
      createElement(
        MapleRoot,
        { branch: BRANCH, client },
        createElement(MapleComposer, {}, createElement(MapleActions)),
      ),
    );

    const publish = () => shadow().querySelector<HTMLButtonElement>(".mk-btn-primary");
    await expect.poll(() => publish()?.textContent).toBe("Publish");
    expect(publish()?.querySelector(".mk-spin")).toBeNull();

    publish()?.click();
    await expect.poll(() => publish()?.querySelector(".mk-spin") !== null).toBe(true);
    expect(publish()?.disabled).toBe(true);
    expect(publish()?.textContent).toBe("Publish");
    expect(client.getState().pending).toBe(1);

    await expect.poll(() => client.getState().pending).toBe(0);
  });
});
