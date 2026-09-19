import { useMapleClient } from "@maple-kit/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { MapleAttachments, MapleComposer } from "../src/composer/index.js";
import { MapleRoot } from "../src/index.js";
import { createShotStore } from "../src/shots.js";
import { offlineFetch } from "./offline.js";

import type { MapleClient } from "@maple-kit/core/client";
import type { PastedImage } from "@maple-kit/core/screenshot";
import type { ReactElement } from "react";

const BRANCH = "feat/ui-shots";

let client: MapleClient | undefined;

/** A one-pixel PNG, which is a real blob without being a real screenshot. */
function image(): PastedImage {
  return {
    blob: new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
    type: "image/png",
  };
}

function Keep(): null {
  client = useMapleClient();
  return null;
}

function tree(): ReactElement {
  return createElement(
    MapleRoot,
    { branch: BRANCH, theme: "light", options: { fetch: offlineFetch() } },
    createElement(Keep),
    createElement(MapleComposer, null, createElement(MapleAttachments)),
  );
}

function root(): ShadowRoot {
  const host = document.querySelector<HTMLElement>("[data-maple-overlay]");
  if (!host?.shadowRoot) throw new Error("no overlay is mounted");
  return host.shadowRoot;
}

beforeEach(async () => {
  localStorage.clear();
  document.documentElement.setAttribute("data-theme", "light");
  await page.viewport(1100, 760);
});

afterEach(() => {
  client?.destroy();
  client = undefined;
  document.documentElement.removeAttribute("data-theme");
  for (const overlay of document.querySelectorAll("[data-maple-overlay]")) overlay.remove();
});

/**
 * The picker takes the shot and the strip shows it, and they are siblings, so
 * the image travels through a store rather than a prop neither could pass.
 */
describe("the one-slot store", () => {
  it("hands the image over once and is empty afterwards", () => {
    const shots = createShotStore();
    const shot = image();

    shots.put(shot);
    expect(shots.get()).toBe(shot);
    expect(shots.take()).toBe(shot);
    expect(shots.take()).toBeUndefined();
  });

  it("tells a listener when one arrives and when one is claimed", () => {
    const shots = createShotStore();
    let told = 0;
    const stop = shots.subscribe(() => (told += 1));

    shots.put(image());
    shots.take();
    stop();
    shots.put(image());

    expect(told).toBe(2);
  });

  it("replaces an image nobody claimed rather than queueing a second", () => {
    const shots = createShotStore();
    const second = image();

    shots.put(image());
    shots.put(second);

    expect(shots.take()).toBe(second);
    expect(shots.take()).toBeUndefined();
  });
});

/** Both gestures are already live on the panel, so a button would be a third. */
describe("the strip with nothing attached", () => {
  it("asks for a paste or a drop, and offers no control to do it with", async () => {
    await render(tree());
    await vi.waitFor(() => expect(root().querySelector(".mk-shots")).not.toBeNull());
    const strip = root().querySelector(".mk-shots");

    expect(strip?.textContent).toContain("Paste or drop an image");
    expect(strip?.querySelector("button")).toBeNull();
    expect(strip?.querySelector("input")).toBeNull();
  });
});
