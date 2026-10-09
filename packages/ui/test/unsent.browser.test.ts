import { createMapleClient } from "@maple-kit/core/client";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { MapleRoot } from "../src/index.js";
import { Unsent } from "../src/island/index.js";

import type { MapleClient } from "@maple-kit/core/client";
import type { ReactElement } from "react";

const BRANCH = "feat/ui-unsent";
const ORIGIN = "https://preview.example";

let client: MapleClient;
let posted: unknown[] = [];
let copiedText = "";

function routeFetch(): typeof globalThis.fetch {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/comments") && (init?.method ?? "GET") === "POST") {
      const body = JSON.parse(typeof init?.body === "string" ? init.body : "null") as unknown;
      posted.push(body);
      const made = (Array.isArray(body) ? body : [body]).map((one, index) => ({
        ...(one as object),
        id: `c_${String(index)}`,
        status: "open",
        author: { id: "u_7", name: "Dana", provenance: "server" },
      }));
      return Promise.resolve(json(Array.isArray(body) ? { comments: made } : made[0], 201));
    }
    if (url.includes("/approvals")) {
      return Promise.resolve(json({ error: "no approvals" }, 501));
    }
    if (url.includes("/me")) {
      return Promise.resolve(json({ user: { id: "u_7", name: "Dana" } }, 200));
    }
    return Promise.resolve(json({ comments: [] }, 200));
  };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function tree(): ReactElement {
  client = createMapleClient({
    branch: BRANCH,
    fetch: routeFetch(),
    origin: ORIGIN,
    storage: memoryStorage(),
    debounceMs: 0,
  });
  client.start();

  return createElement(
    MapleRoot,
    { branch: BRANCH, theme: "light", client },
    createElement(Unsent),
  );
}

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

function root(): ShadowRoot {
  const host = document.querySelector<HTMLElement>("[data-maple-overlay]");
  if (!host?.shadowRoot) throw new Error("no overlay is mounted");
  return host.shadowRoot;
}

function section(): HTMLElement | null {
  return root().querySelector<HTMLElement>(".mk-unsent");
}

function keep(body: string, component: string): void {
  client.openComposer({ kind: "element", anchor: { component } });
  client.setBody(body);
  client.keepDraft();
}

beforeEach(() => {
  posted = [];
  copiedText = "";
  vi.stubGlobal("navigator", {
    ...navigator,
    clipboard: {
      writeText: (text: string) => {
        copiedText = text;
        return Promise.resolve();
      },
    },
  });
});

afterEach(() => {
  client.destroy();
  for (const overlay of document.querySelectorAll("[data-maple-overlay]")) overlay.remove();
  vi.unstubAllGlobals();
});

describe("the unsent line", () => {
  it("draws nothing while nothing is waiting", async () => {
    await render(tree());
    expect(section()).toBeNull();
  });

  it("says some comments are unpublished, and nothing more", async () => {
    await render(tree());
    keep("The spacing is off.", "YieldCard");
    keep("This label is wrong.", "MrrCard");

    await vi.waitFor(() => expect(section()).not.toBeNull());
    expect(section()?.textContent).toBe("Some comments are unpublishedPublish");
    expect(root().querySelector(".mk-solo")).toBeNull();
    expect(root().querySelectorAll(".mk-unsent-row")).toHaveLength(0);
  });

  it("publishes every kept comment in one request", async () => {
    await render(tree());
    keep("first", "A");
    keep("second", "B");
    await vi.waitFor(() => expect(section()).not.toBeNull());

    root().querySelector<HTMLButtonElement>(".mk-split-main")?.click();

    await vi.waitFor(() => expect(client.getState().drafts).toHaveLength(0));
    expect(posted).toHaveLength(1);
    expect((posted[0] as { body: string }[]).map((one) => one.body)).toEqual(["first", "second"]);
    expect(section()).toBeNull();
  });

  it("offers Copy as Markdown and Copy as JSON behind the arrow, and downloads nothing", async () => {
    const link = vi.spyOn(HTMLAnchorElement.prototype, "click");
    await render(tree());
    keep("The spacing is off.", "YieldCard");
    await vi.waitFor(() => expect(section()).not.toBeNull());
    expect(root().querySelector(".mk-split-menu")).toBeNull();

    root().querySelector<HTMLButtonElement>(".mk-split-more")?.click();
    await vi.waitFor(() => expect(root().querySelector(".mk-split-menu")).not.toBeNull());
    const items = [...root().querySelectorAll<HTMLButtonElement>(".mk-split-item")];
    expect(items.map((one) => one.textContent)).toEqual(["Copy as Markdown", "Copy as JSON"]);

    items[0]?.click();
    await vi.waitFor(() => expect(copiedText).toContain("The spacing is off."));
    expect(copiedText).toContain("```maple");
    expect(root().querySelector(".mk-split-menu")).toBeNull();

    root().querySelector<HTMLButtonElement>(".mk-split-more")?.click();
    await vi.waitFor(() => expect(root().querySelector(".mk-split-menu")).not.toBeNull());
    root().querySelectorAll<HTMLButtonElement>(".mk-split-item")[1]?.click();
    await vi.waitFor(() => expect(copiedText).toBe(client.draftsAsJson()));
    expect(link).not.toHaveBeenCalled();
  });
});
