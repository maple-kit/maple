import { commentModifier } from "@maple-kit/core/client";
import { useMapleClient } from "@maple-kit/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";

import {
  MapleActions,
  MapleAttachments,
  MapleBody,
  MapleComposer,
  MapleTarget,
} from "../src/composer/index.js";
import { MapleRoot } from "../src/index.js";
import { Header, Island, IslandContent, IslandTrigger, Item, List } from "../src/island/index.js";
import { MaplePicker } from "../src/picker/index.js";
import { BRANCH, fixtureFetch } from "./fixtures.js";

import type { MapleClient } from "@maple-kit/core/client";

let client: MapleClient;
let dialog: HTMLDialogElement;
let hostKeys: string[];
let detach: AbortController;

function Keep(): null {
  client = useMapleClient();
  return null;
}

function root(): ShadowRoot {
  const host = document.querySelector<HTMLElement>("[data-maple-overlay]");
  if (!host?.shadowRoot) throw new Error("no overlay is mounted");
  return host.shadowRoot;
}

function cardOpen(): boolean {
  return root().querySelector(".mk-card") !== null;
}

/** A host with a modal dialog of its own, opened over a mounted island. */
beforeEach(async () => {
  localStorage.clear();
  hostKeys = [];
  document.documentElement.setAttribute("data-theme", "light");
  await page.viewport(1100, 760);
  await render(
    createElement(
      MapleRoot,
      { branch: BRANCH, theme: "light", options: { fetch: fixtureFetch() } },
      createElement(Keep),
      createElement(MaplePicker),
      createElement(
        Island,
        { defaultOpen: true },
        createElement(IslandTrigger),
        createElement(
          IslandContent,
          null,
          createElement(Header),
          createElement(List, { children: (comment) => createElement(Item, { comment }) }),
        ),
      ),
      createElement(
        MapleComposer,
        null,
        createElement(MapleTarget),
        createElement(MapleBody),
        createElement(MapleAttachments),
        createElement(MapleActions),
      ),
    ),
  );
  await vi.waitFor(() => expect(cardOpen()).toBe(true));

  dialog = document.createElement("dialog");
  dialog.innerHTML = '<input id="host-field" aria-label="host field">';
  document.body.append(dialog);
  detach = new AbortController();
  window.addEventListener("keydown", (event) => hostKeys.push(event.key), {
    signal: detach.signal,
  });
});

afterEach(() => {
  detach.abort();
  client.destroy();
  dialog.remove();
  document.documentElement.removeAttribute("data-theme");
  for (const overlay of document.querySelectorAll("[data-maple-overlay]")) overlay.remove();
});

async function openComposer(): Promise<HTMLTextAreaElement> {
  client.openComposer({ kind: "element", anchor: { component: "YieldCard" }, label: "the card" });
  await vi.waitFor(() => expect(client.getState().composer.open).toBe(true));
  const field = root().querySelector("textarea");
  if (!field) throw new Error("no composer field");
  field.focus();
  return field;
}

describe("Escape with the host's dialog open", () => {
  it("closes the dialog alone when the focus is in it, and Maple stays", async () => {
    dialog.showModal();
    dialog.querySelector("input")?.focus();

    await userEvent.keyboard("{Escape}");

    await vi.waitFor(() => expect(dialog.open).toBe(false));
    expect(cardOpen()).toBe(true);
  });

  it("closes the composer alone when the focus is in it, and the dialog stays", async () => {
    dialog.show();
    await openComposer();

    await userEvent.keyboard("{Escape}");

    await vi.waitFor(() => expect(client.getState().composer.open).toBe(false));
    expect(dialog.open).toBe(true);
    expect(cardOpen()).toBe(true);
    expect(hostKeys).not.toContain("Escape");
  });

  it("closes one layer per press: the composer, then the island", async () => {
    await openComposer();

    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(client.getState().composer.open).toBe(false));
    expect(cardOpen()).toBe(true);

    root().querySelector<HTMLElement>(".mk-island")?.focus();
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(cardOpen()).toBe(false));
  });
});

describe("Escape in the island", () => {
  it("works after clicking a part of the island that is not a control", async () => {
    const card = root().querySelector<HTMLElement>(".mk-card");
    card?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    root().querySelector<HTMLElement>(".mk-island")?.focus();
    expect(root().activeElement).toBe(root().querySelector(".mk-island"));

    await userEvent.keyboard("{Escape}");

    await vi.waitFor(() => expect(cardOpen()).toBe(false));
  });

  it("does not take Escape once Maple is closed", async () => {
    root().querySelector<HTMLElement>(".mk-island")?.focus();
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(cardOpen()).toBe(false));
    hostKeys.length = 0;

    await userEvent.keyboard("{Escape}");

    expect(hostKeys).toEqual(["Escape"]);
  });
});

describe("Escape while picking", () => {
  it("only calls off the pick, and leaves the island open", async () => {
    client.arm("element");
    await vi.waitFor(() => expect(client.getState().pick.armed).toBe(true));
    document.body.focus();

    await userEvent.keyboard("{Escape}");

    await vi.waitFor(() => expect(client.getState().pick.armed).toBe(false));
    expect(cardOpen()).toBe(true);
  });
});

describe("a tap of Shift and the comment modifier", () => {
  it("closes Maple with the focus on the page", async () => {
    document.body.focus();
    const key = commentModifier();
    const flag = key === "Meta" ? { metaKey: true } : { ctrlKey: true };
    const send = (type: string, init: KeyboardEventInit) =>
      window.dispatchEvent(new KeyboardEvent(type, { bubbles: true, ...init }));

    send("keydown", { key: "Shift", shiftKey: true });
    send("keydown", { key, shiftKey: true, ...flag });
    send("keyup", { key, shiftKey: true });
    send("keyup", { key: "Shift" });

    await vi.waitFor(() => expect(cardOpen()).toBe(false));
  });
});
