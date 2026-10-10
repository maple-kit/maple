import { createMapleClient } from "@maple-kit/core/client";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { MapleActions } from "../src/composer/actions.js";
import { MapleBody } from "../src/composer/body.js";
import { MapleComposer } from "../src/composer/composer.js";
import { MapleRoot } from "../src/index.js";
import {
  FilterPick,
  Filters,
  FilterTally,
  ImportDrafts,
  Island,
  IslandContent,
  SignIn,
} from "../src/island/index.js";

import type { MapleClient } from "@maple-kit/core/client";

const BRANCH = "feat/ui-signed-out";

let client: MapleClient;
let downloads: string[] = [];

function memoryStorage(): Storage {
  const held = new Map<string, string>();
  return {
    get length() {
      return held.size;
    },
    clear: () => held.clear(),
    getItem: (key: string) => held.get(key) ?? null,
    key: (index: number) => [...held.keys()][index] ?? null,
    removeItem: (key: string) => {
      held.delete(key);
    },
    setItem: (key: string, value: string) => {
      held.set(key, value);
    },
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** `signedIn` false is a route that offers GitHub and has no session. */
function tree(signedIn: boolean) {
  client = createMapleClient({
    branch: BRANCH,
    fetch: (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (init?.method === "POST" && url.endsWith("/comments")) {
        const sent = JSON.parse(init.body as string) as Record<string, unknown>[];
        return Promise.resolve(
          json({
            comments: sent.map((one, index) => ({
              ...one,
              id: `c${String(index)}`,
              status: "open",
              createdAt: "2026-09-18T10:00:00.000Z",
              author: { id: "u", name: "Dana", provenance: "server", colorSlot: 1 },
            })),
          }),
        );
      }
      if (url.includes("/me")) {
        return Promise.resolve(
          json(
            signedIn
              ? { user: { id: "u", name: "Dana" }, github: { linked: true, login: "dana" } }
              : { user: null, github: { linked: false } },
          ),
        );
      }
      if (url.includes("/auth/github")) {
        return Promise.resolve(
          json({
            userCode: "WDJB-MJHT",
            verificationUri: "https://github.com/login/device",
            expiresAt: Date.now() + 900_000,
            interval: 5,
            status: "pending",
          }),
        );
      }
      return Promise.resolve(json({ comments: [] }));
    },
    origin: "https://preview.example",
    storage: memoryStorage(),
    debounceMs: 0,
  });
  client.start();
  void client.load();

  return createElement(
    MapleRoot,
    { branch: BRANCH, theme: "light", client },
    createElement(
      Island,
      { defaultOpen: true },
      createElement(
        IslandContent,
        null,
        createElement(
          Filters,
          null,
          createElement(FilterPick),
          createElement(ImportDrafts),
          createElement(FilterTally),
        ),
      ),
    ),
    createElement(
      MapleComposer,
      null,
      createElement(MapleBody, { key: "body" }),
      createElement(MapleActions, { key: "actions" }),
    ),
    createElement(SignIn),
  );
}

function root(): ShadowRoot {
  const host = document.querySelector<HTMLElement>("[data-maple-overlay]");
  if (!host?.shadowRoot) throw new Error("no overlay is mounted");
  return host.shadowRoot;
}

function download(): HTMLButtonElement {
  const found = root().querySelector<HTMLButtonElement>('[aria-label="Download drafts"]');
  if (!found) throw new Error("no Download button");
  return found;
}

function footer(): HTMLElement {
  return root().querySelector<HTMLElement>(".mk-composer-foot")!;
}

async function ready(): Promise<void> {
  await vi.waitFor(() => expect(client.getState().phase).toBe("ready"));
}

function type(component: string, body: string): void {
  client.openComposer({ kind: "element", anchor: { component } });
  client.setBody(body);
}

beforeEach(() => {
  downloads = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLElement) {
    downloads.push((this as HTMLAnchorElement).download);
  });
});

afterEach(() => {
  client.destroy();
  for (const overlay of document.querySelectorAll("[data-maple-overlay]")) overlay.remove();
  vi.restoreAllMocks();
});

describe("a comment being typed", () => {
  it("is not a saved draft until it is kept", async () => {
    await render(tree(false));
    await ready();
    const options = () =>
      [...(root().querySelector<HTMLSelectElement>(".mk-filter-pick")?.options ?? [])].map(
        (one) => one.value,
      );

    type("MrrCard", "Half a thought");
    await vi.waitFor(() => expect(client.getState().drafts).toHaveLength(1));
    expect(options()).not.toContain("drafts");
    expect(download().disabled).toBe(true);
    expect(root().querySelector(".mk-icon-dot")).toBeNull();

    client.keepDraft();
    await vi.waitFor(() => expect(options()).toContain("drafts"));
    expect(download().disabled).toBe(false);
  });

  it("is saved already when the panel was opened on a draft that was kept", async () => {
    await render(tree(false));
    await ready();
    type("MrrCard", "Kept");
    client.keepDraft();

    client.openComposer({ kind: "element", anchor: { component: "MrrCard" } });
    client.setBody("Kept, then edited");

    await vi.waitFor(() => expect(download().disabled).toBe(false));
    expect(root().querySelector(".mk-icon-dot")).not.toBeNull();
  });
});

describe("Download", () => {
  it("carries a green dot only when signed out with saved drafts", async () => {
    await render(tree(false));
    await ready();
    expect(root().querySelector(".mk-icon-dot")).toBeNull();

    type("MrrCard", "First");
    client.keepDraft();

    await vi.waitFor(() => expect(root().querySelector(".mk-icon-dot")).not.toBeNull());
    const dot = root().querySelector<HTMLElement>(".mk-icon-dot")!;
    const probe = document.createElement("span");
    probe.style.color = "var(--mk-ok)";
    root().querySelector(".mk-transfer")!.append(probe);
    expect(getComputedStyle(dot).backgroundColor).toBe(getComputedStyle(probe).color);
  });

  it("shows no dot to a reviewer who is signed in", async () => {
    await render(tree(true));
    await ready();
    type("MrrCard", "First");
    client.keepDraft();

    await vi.waitFor(() => expect(download().disabled).toBe(false));
    expect(root().querySelector(".mk-icon-dot")).toBeNull();
  });

  it("saves the drafts as a file", async () => {
    await render(tree(false));
    await ready();
    type("MrrCard", "First");
    client.keepDraft();
    await vi.waitFor(() => expect(download().disabled).toBe(false));

    download().click();

    expect(downloads).toEqual(["maple-drafts.json"]);
  });

  it("has no unpublished line beside it any more", async () => {
    await render(tree(false));
    await ready();
    type("MrrCard", "First");
    client.keepDraft();

    await vi.waitFor(() => expect(download().disabled).toBe(false));
    expect(root().textContent).not.toContain("unpublished");
    expect(root().querySelector(".mk-split")).toBeNull();
  });
});

describe("Publish all", () => {
  const publishAll = () =>
    root().querySelector<HTMLButtonElement>('.mk-transfer [aria-label="Publish all"]') ?? undefined;

  it("is beside Download for a signed-in reviewer with saved drafts, and publishes them", async () => {
    await render(tree(true));
    await ready();
    type("MrrCard", "First");
    client.keepDraft();
    type("YieldCard", "Second");
    client.keepDraft();

    await vi.waitFor(() => expect(publishAll()).toBeDefined());
    const buttons = [...root().querySelectorAll(".mk-transfer button")];
    expect(buttons.indexOf(publishAll()!)).toBe(buttons.indexOf(download()) + 1);
    expect(publishAll()!.title).toBe("Publish all");
    expect(publishAll()!.textContent).toBe("");
    expect(publishAll()!.getBoundingClientRect().width).toBe(
      download().getBoundingClientRect().width,
    );

    publishAll()!.click();
    await vi.waitFor(() => expect(client.getState().drafts).toHaveLength(0));
    expect(publishAll()).toBeUndefined();
  });

  it("is not there while the reviewer is signed out", async () => {
    await render(tree(false));
    await ready();
    type("MrrCard", "First");
    client.keepDraft();

    await vi.waitFor(() => expect(download().disabled).toBe(false));
    expect(publishAll()).toBeUndefined();
  });

  it("is not there with nothing saved, nor for a comment still being typed", async () => {
    await render(tree(true));
    await ready();
    expect(publishAll()).toBeUndefined();

    type("MrrCard", "Typing");
    await vi.waitFor(() => expect(client.getState().drafts).toHaveLength(1));
    expect(publishAll()).toBeUndefined();
  });
});

describe("the composer's buttons", () => {
  it("offers Publish and a quiet Save as draft to a reviewer who is signed in", async () => {
    await render(tree(true));
    await ready();
    type("MrrCard", "Ready");

    await vi.waitFor(() => expect(footer()).not.toBeNull());
    const labels = [...footer().querySelectorAll("button")].map((one) => one.textContent);
    expect(labels).toEqual(["Save as draft", "Publish"]);
    expect(footer().querySelector(".mk-btn-quiet")?.textContent).toBe("Save as draft");
  });

  it("hides Publish when signed out, and makes Save as draft the primary", async () => {
    await render(tree(false));
    await ready();
    type("MrrCard", "Ready");

    await vi.waitFor(() => expect(footer()).not.toBeNull());
    const labels = [...footer().querySelectorAll("button")].map((one) => one.textContent);
    expect(labels).toEqual(["Sign in", "Save as draft"]);
    expect(footer().querySelector(".mk-btn-primary")?.textContent).toBe("Save as draft");
    expect(footer().querySelector(".mk-composer-hint")?.textContent).toBe(
      "Sign in to publish directly",
    );
  });

  it("opens the sign-in popup from the Sign in link", async () => {
    await render(tree(false));
    await ready();
    type("MrrCard", "Ready");
    await vi.waitFor(() => expect(footer().querySelector(".mk-link")).not.toBeNull());

    footer().querySelector<HTMLButtonElement>(".mk-link")?.click();

    await vi.waitFor(() =>
      expect(root().querySelector(".mk-popup")?.hasAttribute("open")).toBe(true),
    );
    expect(root().querySelector(".mk-step-code")?.textContent).toBe("WDJB-MJHT");
  });
});
