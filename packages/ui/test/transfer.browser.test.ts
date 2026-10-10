import { createMapleClient } from "@maple-kit/core/client";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { MapleRoot } from "../src/index.js";
import { ImportDrafts, OtherDrafts } from "../src/island/index.js";

import type { MapleClient } from "@maple-kit/core/client";
import type { Draft } from "@maple-kit/core/overlay";

const BRANCH = "cold-brew-lab";
const NOW = Date.parse("2026-09-18T10:00:00.000Z");

let client: MapleClient;

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

function draft(id: string, body: string, at = NOW): Draft {
  return {
    id,
    body,
    anchor: { selector: "main" },
    updatedAt: new Date(at).toISOString(),
  };
}

function exportFile(branch: string, drafts: readonly unknown[]): string {
  return JSON.stringify({ version: 1, branch, drafts });
}

function tree(storage: Storage = memoryStorage()) {
  client = createMapleClient({
    branch: BRANCH,
    fetch: () => Promise.resolve(new Response("{}", { status: 501 })),
    origin: "https://preview.example",
    storage,
    now: () => NOW,
    debounceMs: 0,
  });
  client.start();

  return createElement(
    MapleRoot,
    { branch: BRANCH, theme: "light", client },
    createElement(OtherDrafts),
    createElement(ImportDrafts),
  );
}

function root(): ShadowRoot {
  const host = document.querySelector<HTMLElement>("[data-maple-overlay]");
  if (!host?.shadowRoot) throw new Error("no overlay is mounted");
  return host.shadowRoot;
}

/** Clicks the button once it exists and is enabled: React draws a tick later. */
async function press(label: string): Promise<void> {
  await vi.waitFor(() => {
    const found = [...root().querySelectorAll<HTMLButtonElement>("button")].find(
      (one) =>
        (one.textContent === label || one.getAttribute("aria-label") === label) && !one.disabled,
    );
    if (!found) throw new Error(`no enabled button says ${label}`);
    found.click();
  });
}

async function paste(text: string): Promise<void> {
  await vi.waitFor(() => expect(root().querySelector(".mk-transfer-box")).not.toBeNull());
  const box = root().querySelector<HTMLTextAreaElement>(".mk-transfer-box");
  const native = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value") as {
    set: (this: HTMLTextAreaElement, value: string) => void;
  };
  if (box) native.set.call(box, text);
  box?.dispatchEvent(new Event("input", { bubbles: true }));
}

function note(): string {
  return root().querySelector(".mk-transfer-note")?.textContent ?? "";
}

function rows(): string[] {
  return client.getState().drafts.map((one) => one.body);
}

afterEach(() => {
  client.destroy();
  for (const overlay of document.querySelectorAll("[data-maple-overlay]")) overlay.remove();
  vi.restoreAllMocks();
});

describe("importing drafts", () => {
  it("adds a pasted export to the list and says so", async () => {
    await render(tree());
    await press("Import drafts");
    await paste(exportFile(BRANCH, [draft("d1", "the crema looks thin")]));
    await press("Add");

    await vi.waitFor(() => expect(rows()).toEqual(["the crema looks thin"]));
    expect(note()).toBe("Added 1");
  });

  it("adds nothing the second time, and says why", async () => {
    await render(tree());
    await press("Import drafts");
    const file = exportFile(BRANCH, [draft("d1", "the crema looks thin")]);
    await paste(file);
    await press("Add");
    await vi.waitFor(() => expect(note()).toBe("Added 1"));

    await paste(file);
    await press("Add");

    await vi.waitFor(() => expect(note()).toBe("Added 0 · 1 already here"));
    expect(rows()).toHaveLength(1);
  });

  it("refuses text that is not an export, and reports an entry that is not a draft", async () => {
    await render(tree());
    await press("Import drafts");
    await paste("not json at all");
    await press("Add");
    await vi.waitFor(() => expect(note()).toBe("That is not a Maple drafts export."));

    await paste(exportFile(BRANCH, [draft("d1", "kept"), { id: "d2" }]));
    await press("Add");
    await vi.waitFor(() => expect(note()).toBe("Added 1 · 1 not drafts"));
  });

  it("asks before adding drafts written on another branch", async () => {
    await render(tree());
    await press("Import drafts");
    await paste(exportFile("espresso-bar", [draft("d1", "from the other branch")]));
    await press("Add");

    await vi.waitFor(() =>
      expect(root().querySelector(".mk-transfer-ask")?.textContent).toContain(
        "1 draft was written on espresso-bar. Add it here?",
      ),
    );
    expect(rows()).toEqual([]);

    await press("Cancel");
    expect(rows()).toEqual([]);

    await press("Add");
    await press("Add here");
    await vi.waitFor(() => expect(rows()).toEqual(["from the other branch"]));
  });

  it("reads a dropped file into the box", async () => {
    await render(tree());
    await press("Import drafts");
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([exportFile(BRANCH, [draft("d1", "dropped")])], "drafts.json", {
        type: "application/json",
      }),
    );

    root()
      .querySelector(".mk-transfer-box")
      ?.dispatchEvent(
        new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }),
      );

    await vi.waitFor(() =>
      expect(root().querySelector<HTMLTextAreaElement>(".mk-transfer-box")?.value).toContain(
        "dropped",
      ),
    );
    await press("Add");
    await vi.waitFor(() => expect(rows()).toEqual(["dropped"]));
  });
});

describe("drafts saved under another branch", () => {
  function seeded(): Storage {
    const storage = memoryStorage();
    storage.setItem(
      "maple:drafts:espresso-bar",
      JSON.stringify([draft("d1", "the crema looks thin"), draft("d2", "the label wraps")]),
    );
    return storage;
  }

  it("shows a quiet row and merges nothing on its own", async () => {
    await render(tree(seeded()));

    await vi.waitFor(() =>
      expect(root().querySelector(".mk-transfer-other")?.textContent).toContain(
        "2 drafts saved under espresso-bar",
      ),
    );
    expect(rows()).toEqual([]);
  });

  it("moves them here when asked", async () => {
    await render(tree(seeded()));
    await vi.waitFor(() => expect(root().querySelector(".mk-transfer-other")).not.toBeNull());
    await press("Move here");

    await vi.waitFor(() => expect(rows()).toHaveLength(2));
    expect(root().querySelector(".mk-transfer-other")).toBeNull();
  });

  it("goes away when dismissed, and adds nothing", async () => {
    await render(tree(seeded()));
    await vi.waitFor(() => expect(root().querySelector(".mk-transfer-other")).not.toBeNull());
    await press("Dismiss");

    await vi.waitFor(() => expect(root().querySelector(".mk-transfer-other")).toBeNull());
    expect(rows()).toEqual([]);
  });

  it("does not appear for a key holding only drafts too old to keep", async () => {
    const storage = memoryStorage();
    storage.setItem(
      "maple:drafts:espresso-bar",
      JSON.stringify([draft("old", "ancient", NOW - 8 * 24 * 60 * 60 * 1000)]),
    );
    await render(tree(storage));

    expect(root().querySelector(".mk-transfer-other")).toBeNull();
  });
});
