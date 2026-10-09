import { useMapleClient } from "@maple-kit/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { MapleAttachments, MapleComposer } from "../src/composer/index.js";
import { MapleRoot } from "../src/index.js";
import { createShotStore, useShots } from "../src/shots.js";
import { offlineFetch } from "./offline.js";

import type { Shot, ShotStore } from "../src/shots.js";
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

/** The picker's usual outcome, wrapped the way the store now holds it. */
function taken(): Shot {
  return { status: "taken", image: image() };
}

let mounted: ShotStore | null = null;

function Keep(): null {
  client = useMapleClient();
  mounted = useShots();
  return null;
}

function tree(media = true, refuse?: number): ReactElement {
  const answers = { media, ...(refuse === undefined ? {} : { refuse }) };
  return createElement(
    MapleRoot,
    { branch: BRANCH, theme: "light", options: { fetch: offlineFetch(answers) } },
    createElement(Keep),
    createElement(MapleComposer, null, createElement(MapleAttachments)),
  );
}

function strip(): HTMLElement | null {
  return root().querySelector<HTMLElement>(".mk-shots, .mk-note");
}

/** Mounts and waits for `/me` to have answered, which is what `media` needs. */
async function ready(media = true): Promise<HTMLElement> {
  await render(tree(media));
  await vi.waitFor(() => expect(client?.getState().phase).toBe("ready"));
  await vi.waitFor(() => expect(strip()).not.toBeNull());
  return strip()!;
}

/** An open composer, because nothing is written onto a closed one. */
async function writing(media = true): Promise<HTMLElement> {
  const found = await ready(media);
  client?.openComposer({ kind: "element", anchor: { component: "YieldCard" } });
  return found;
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
  mounted = null;
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
    const shot = taken();

    shots.put(shot);
    expect(shots.get()).toBe(shot);
    expect(shots.take()).toBe(shot);
    expect(shots.take()).toBeUndefined();
  });

  it("tells a listener when one arrives and when one is claimed", () => {
    const shots = createShotStore();
    let told = 0;
    const stop = shots.subscribe(() => (told += 1));

    shots.put(taken());
    shots.take();
    stop();
    shots.put(taken());

    expect(told).toBe(2);
  });

  it("replaces an image nobody claimed rather than queueing a second", () => {
    const shots = createShotStore();
    const second = taken();

    shots.put(taken());
    shots.put(second);

    expect(shots.take()).toBe(second);
    expect(shots.take()).toBeUndefined();
  });
});

/** Both gestures are already live on the panel, so a button would be a third. */
describe("the strip with nothing attached", () => {
  it("asks for a paste or a drop, and offers no control to do it with", async () => {
    const found = await ready();

    expect(found.textContent).toContain("Paste or drop an image");
    expect(found.querySelector("button")).toBeNull();
    expect(found.querySelector("input")).toBeNull();
  });
});

/**
 * Three ways a screenshot does not happen, and all three used to be the same
 * line asking for a paste — which reads as a tool that never took one.
 */
describe("when there is no screenshot", () => {
  it("says so where the deployment keeps none, rather than asking for one", async () => {
    const found = await ready(false);

    expect(found.textContent).toContain("keeps no screenshots");
    expect(found.textContent).not.toContain("Paste or drop");
  });

  it("does not say it before the route has answered, because it does not know", async () => {
    await render(tree(false));
    await vi.waitFor(() => expect(strip()).not.toBeNull());

    expect(strip()?.textContent).toContain("Paste or drop an image");
  });

  it("says a capture was tried and failed, which snapdom missing looks like", async () => {
    await ready();
    shotsOf().put({ status: "failed", reason: "snapdom is not installed" });

    await vi.waitFor(() => expect(strip()?.textContent).toContain("could not take a screenshot"));
  });
});

/** The store the root made, reached the way the picker reaches it. */
function shotsOf(): ShotStore {
  if (!mounted) throw new Error("no shot store is mounted");
  return mounted;
}

/**
 * The strip used to need an `upload` prop before an image went anywhere, so a
 * default installation previewed a screenshot and then dropped it.
 */
describe("the default upload", () => {
  it("puts a capture on the route without the application wiring one", async () => {
    await writing();
    shotsOf().put(taken());

    await vi.waitFor(() => expect(client?.getState().composer.attachments).toHaveLength(1));
    expect(client?.getState().composer.attachments[0]).toMatchObject({
      key: "shot-1",
      source: "capture",
    });
  });

  it("marks a pasted one as the reviewer's, not as Maple's own", async () => {
    await writing();
    root().querySelector<HTMLElement>(".mk-composer")!.dispatchEvent(pasted());

    await vi.waitFor(() => expect(client?.getState().composer.attachments).toHaveLength(1));
    expect(client?.getState().composer.attachments[0]?.source).toBe("offered");
  });

  it("attempts nothing where the deployment keeps none", async () => {
    await writing(false);
    shotsOf().put(taken());

    await vi.waitFor(() => expect(strip()?.textContent).toContain("keeps no screenshots"));
    expect(client?.getState().composer.attachments).toHaveLength(0);
  });

  it("shows a note with a docs link, and no thumbnail or remove button", async () => {
    await writing(false);
    shotsOf().put(taken());

    await vi.waitFor(() => expect(strip()?.textContent).toContain("turn on screenshot storage"));
    expect(strip()?.querySelector("img")).toBeNull();
    expect(strip()?.querySelector("button")).toBeNull();
    const link = strip()?.querySelector("a");
    expect(link?.getAttribute("href")).toContain("docs/screenshots.md");
    expect(link?.getAttribute("rel")).toContain("noopener");
  });

  /** `/me` is asked alongside the list, so a 401 on the comments answered it. */
  it("still knows there is nowhere to keep one when the load itself failed", async () => {
    await render(tree(false, 401));
    await vi.waitFor(() => expect(client?.getState().phase).toBe("error"));
    client?.openComposer({ kind: "element", anchor: { component: "YieldCard" } });
    await vi.waitFor(() => expect(strip()).not.toBeNull());
    shotsOf().put(taken());

    await vi.waitFor(() => expect(strip()?.textContent).toContain("turn on screenshot storage"));
  });
});

/** A paste carrying one image, as the panel's own handler reads it. */
function pasted(): ClipboardEvent {
  const data = new DataTransfer();
  data.items.add(new File([image().blob], "shot.png", { type: "image/png" }));
  return new ClipboardEvent("paste", { bubbles: true, clipboardData: data });
}
