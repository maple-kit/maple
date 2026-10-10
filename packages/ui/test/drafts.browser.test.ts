import { createMapleClient } from "@maple-kit/core/client";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { MapleRoot } from "../src/index.js";
import {
  Approve,
  FilterPick,
  Filters,
  FilterTally,
  ImportDrafts,
  Island,
  IslandContent,
  Item,
  List,
} from "../src/island/index.js";

import type { Comment } from "@maple-kit/core";
import type { MapleClient } from "@maple-kit/core/client";

const BRANCH = "feat/ui-drafts";

let client: MapleClient;
let failLoad = false;

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

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function tree() {
  client = createMapleClient({
    branch: BRANCH,
    fetch: (input) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("/me"))
        return Promise.resolve(json({ user: { id: "u", name: "Dana" } }, 200));
      if (url.includes("/approvals")) return Promise.resolve(json({ error: "none" }, 501));
      return Promise.resolve(failLoad ? json({ error: "boom" }, 500) : json({ comments: [] }, 200));
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
          createElement(Approve),
          createElement(FilterTally),
        ),
        createElement(List, {
          children: (comment: Comment) => createElement(Item, { comment }),
        }),
      ),
    ),
  );
}

function root(): ShadowRoot {
  const host = document.querySelector<HTMLElement>("[data-maple-overlay]");
  if (!host?.shadowRoot) throw new Error("no overlay is mounted");
  return host.shadowRoot;
}

async function ready(): Promise<void> {
  await vi.waitFor(() => expect(client.getState().phase).toBe("ready"));
}

function keep(body: string): void {
  client.openComposer({ kind: "element", anchor: { component: body } });
  client.setBody(body);
  client.keepDraft();
}

afterEach(() => {
  failLoad = false;
  client.destroy();
  for (const overlay of document.querySelectorAll("[data-maple-overlay]")) overlay.remove();
});

describe("drafts as a status", () => {
  it("is a filter value only while there are drafts, and narrows the list to them", async () => {
    await render(tree());
    const select = () => root().querySelector<HTMLSelectElement>(".mk-filter-pick");
    await vi.waitFor(() => expect(select()).not.toBeNull());
    expect([...(select()?.options ?? [])].map((one) => one.value)).not.toContain("drafts");

    await ready();
    keep("first");
    keep("second");
    await vi.waitFor(() =>
      expect([...(select()?.options ?? [])].map((one) => one.value)).toContain("drafts"),
    );
    client.setFilter("drafts");

    await vi.waitFor(() => expect(root().querySelectorAll(".mk-row")).toHaveLength(2));
    expect(root().querySelectorAll(".mk-draft-row .mk-row")).toHaveLength(2);
  });

  it("opens a draft from its row, and throws it away from the row's own x", async () => {
    await render(tree());
    await ready();
    keep("first");
    keep("second");
    client.setFilter("drafts");
    await vi.waitFor(() => expect(root().querySelectorAll(".mk-draft-row")).toHaveLength(2));

    root().querySelector<HTMLButtonElement>(".mk-draft-drop")?.click();
    await vi.waitFor(() => expect(client.getState().drafts).toHaveLength(1));
    expect(client.getState().composer.open).toBe(false);

    root().querySelector<HTMLElement>(".mk-draft-row .mk-row")?.click();
    await vi.waitFor(() => expect(client.getState().composer.open).toBe(true));
  });

  it("goes back to Active when the last draft is gone", async () => {
    await render(tree());
    await ready();
    keep("only");
    client.setFilter("drafts");
    await vi.waitFor(() => expect(root().querySelectorAll(".mk-draft-row")).toHaveLength(1));

    client.discardDraft(client.getState().drafts[0]?.id);

    await vi.waitFor(() => expect(client.getState().filter).toBe("all"));
  });
});

describe("the status line", () => {
  it("holds the select, an icon-only import, the tally and the sign-off, in that order", async () => {
    await render(tree());
    await vi.waitFor(() => expect(root().querySelector(".mk-filters")).not.toBeNull());
    const line = root().querySelector(".mk-filters");
    const order = [".mk-filter-chip", ".mk-transfer", ".mk-tally"].map((selector) =>
      line?.querySelector(selector),
    );
    expect(order.every((one) => one !== null)).toBe(true);

    const toggle = root().querySelector<HTMLButtonElement>(".mk-transfer > button");
    expect(toggle?.textContent).toBe("");
    expect(toggle?.getAttribute("aria-label")).toBe("Import drafts");
    expect(toggle?.querySelector("svg")).not.toBeNull();
  });
});

describe("a list that could not be read", () => {
  it("draws a titled state with an inline way to retry, and no second line", async () => {
    failLoad = true;
    await render(tree());

    await vi.waitFor(() => expect(root().querySelector(".mk-empty-error")).not.toBeNull());
    const state = root().querySelector(".mk-empty-error");
    expect(state?.querySelector("svg")).not.toBeNull();
    expect(state?.textContent).toContain("Couldn't load the comments");
    expect(state?.textContent).not.toContain("not the whole story");
    expect(state?.querySelector("button.mk-btn")).toBeNull();
    expect(state?.querySelector(".mk-empty-title .mk-link")?.textContent).toBe("Try again");

    failLoad = false;
    state?.querySelector<HTMLButtonElement>(".mk-link")?.click();
    await vi.waitFor(() => expect(root().querySelector(".mk-empty-error")).toBeNull());
  });
});
