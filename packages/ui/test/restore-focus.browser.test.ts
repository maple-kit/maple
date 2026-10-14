import { toCommentContext } from "@maple-kit/core/overlay";
import { useMapleClient } from "@maple-kit/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { MapleAttachments, MapleBody, MapleComposer, MapleTarget } from "../src/composer/index.js";
import { MapleRoot } from "../src/index.js";
import { offlineFetch } from "./offline.js";

import type { MapleClient } from "@maple-kit/core/client";
import type { PageContext } from "@maple-kit/core/overlay";
import type { ReactElement } from "react";

const BRANCH = "feat/ui-restore-focus";

const PAGE: PageContext = {
  url: "https://preview.example/dashboard",
  viewport: { width: 1440, height: 900, contentWidth: 1020, dpr: 2 },
  scheme: "light",
  locale: "en-GB",
  timeZone: "Europe/Berlin",
  reducedMotion: false,
  regions: [],
  capturedAt: "2026-03-02T10:00:00.000Z",
};

let client: MapleClient;

function Keep(): null {
  client = useMapleClient();
  return null;
}

function tree(): ReactElement {
  return createElement(
    MapleRoot,
    { branch: BRANCH, theme: "light", options: { fetch: offlineFetch(), debounceMs: 0 } },
    createElement(Keep),
    createElement(
      MapleComposer,
      null,
      createElement(MapleTarget, { key: "t" }),
      createElement(MapleBody, { key: "b" }),
      createElement(MapleAttachments, { key: "a" }),
    ),
  );
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

function field(): HTMLTextAreaElement {
  return find<HTMLTextAreaElement>("textarea.mk-body");
}

function key(name: string): void {
  const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
  field().dispatchEvent(event);
}

beforeEach(async () => {
  localStorage.clear();
  document.documentElement.setAttribute("data-theme", "light");
  await page.viewport(1100, 760);
});

afterEach(() => {
  client.destroy();
  for (const button of document.querySelectorAll("body > button")) button.remove();
  document.documentElement.removeAttribute("data-theme");
  for (const overlay of document.querySelectorAll("[data-maple-overlay]")) overlay.remove();
});

function hostButton(label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = label;
  document.body.append(button);
  return button;
}

async function openFrom(button: HTMLButtonElement): Promise<void> {
  await render(tree());
  await vi.waitFor(() => expect(root().querySelector(".mk-composer")).not.toBeNull());
  button.focus();
  client.openComposer({
    kind: "text",
    anchor: { component: "GateNotice", quote: { exact: "until an agent resolves it" } },
    label: "the gate notice",
    context: toCommentContext(PAGE),
  });
  await vi.waitFor(() => expect(root().activeElement).toBe(field()));
}

async function closed(): Promise<void> {
  await vi.waitFor(() => expect(find(".mk-composer").getAttribute("data-mk-open")).toBe("false"));
}

describe("focus after the composer closes", () => {
  const ways: readonly [string, () => void][] = [
    ["Escape", () => key("Escape")],
    ["keeping the draft", () => client.keepDraft()],
    ["discarding the draft", () => client.discardDraft()],
    ["closing it", () => client.closeComposer()],
  ];

  it.each(ways)("returns to the host control on %s", async (_name, close) => {
    const button = hostButton("host action");
    await openFrom(button);
    expect(document.activeElement).not.toBe(button);

    close();
    await closed();

    expect(document.activeElement).toBe(button);
  });

  it("leaves focus alone when the control is gone", async () => {
    const button = hostButton("host action");
    await openFrom(button);
    button.remove();

    key("Escape");
    await closed();

    expect(document.activeElement).not.toBe(button);
  });

  it("leaves focus alone when the viewer moved it elsewhere", async () => {
    const button = hostButton("host action");
    const other = hostButton("other action");
    await openFrom(button);
    other.focus();

    client.closeComposer();
    await closed();

    expect(document.activeElement).toBe(other);
  });
});
