import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDraftKeeper, createMapleClient, watchTheme } from "../src/client/index.js";
import { storedComment } from "../src/testing/fixtures.js";

import type { ComposerTarget, MapleClient, ThemeState } from "../src/client/index.js";

const BRANCH = "feat/x";
const NOW = Date.parse("2026-09-18T10:00:00.000Z");
const TARGET: ComposerTarget = { kind: "element", anchor: { component: "YieldCard" } };

let maple: MapleClient | undefined;

function client(debounceMs = 0): MapleClient {
  maple = createMapleClient({ branch: BRANCH, now: () => NOW, debounceMs });
  maple.start();
  return maple;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  getSelection()?.removeAllRanges();
  maple?.destroy();
  maple = undefined;
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
  for (const link of document.querySelectorAll("a[data-test]")) link.remove();
});

/**
 * A reviewer will toggle the site's theme in the middle of writing, and an
 * overlay left on the old scheme is the one that disappears into the page.
 */
describe("watching the host's theme", () => {
  it("re-reads when the root's attributes change", async () => {
    document.documentElement.setAttribute("data-theme", "light");
    const seen: ThemeState[] = [];
    const watch = watchTheme({ view: window, onChange: (theme) => seen.push(theme) });

    expect(watch.current()).toMatchObject({ host: "light", overlay: "dark" });
    document.documentElement.setAttribute("data-theme", "dark");

    await vi.waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).toEqual({ host: "dark", overlay: "light", source: "attribute" });
    watch.stop();
  });

  it("re-reads when the root's class changes, and stops when told to", async () => {
    const seen: ThemeState[] = [];
    const watch = watchTheme({ view: window, onChange: (theme) => seen.push(theme) });

    document.documentElement.classList.add("dark");
    await vi.waitFor(() => expect(seen).toHaveLength(1));

    watch.stop();
    document.documentElement.classList.remove("dark");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(seen).toHaveLength(1);
  });
});

describe("a click on a link in the page", () => {
  it("writes the pending draft without standing in the reviewer's way", () => {
    const maple = client(5000);
    maple.openComposer(TARGET);
    maple.setBody("The spacing is off.");
    expect(localStorage.getItem(`maple:drafts:${BRANCH}`)).toBeNull();

    const link = document.createElement("a");
    link.href = "/elsewhere";
    link.dataset["test"] = "";
    link.textContent = "Elsewhere";
    document.body.append(link);

    const swallow = (event: Event): void => event.preventDefault();
    document.addEventListener("click", swallow);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, composed: true });
    link.dispatchEvent(event);
    document.removeEventListener("click", swallow);

    expect(localStorage.getItem(`maple:drafts:${BRANCH}`)).toContain("The spacing is off.");
  });

  it("ignores a click on something that is not a link", () => {
    const maple = client(5000);
    maple.openComposer(TARGET);
    maple.setBody("The spacing is off.");

    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    expect(localStorage.getItem(`maple:drafts:${BRANCH}`)).toBeNull();
  });
});

/** The failure: a reviewer handed back a comment another tab already posted. */
describe("a storage event from another tab", () => {
  it("drops a draft the other tab sent", () => {
    const maple = client();
    maple.openComposer(TARGET);
    maple.setBody("The spacing is off.");
    const [draft] = maple.getState().drafts;

    const otherTab = createDraftKeeper({ branch: BRANCH, now: () => NOW });
    otherTab.markSent(draft!.id);
    window.dispatchEvent(new StorageEvent("storage", { key: `maple:sent:${BRANCH}` }));

    expect(maple.getState().drafts).toEqual([]);
  });

  it("leaves a draft alone when the event was about another branch", () => {
    const maple = client();
    maple.openComposer(TARGET);
    maple.setBody("The spacing is off.");

    window.dispatchEvent(new StorageEvent("storage", { key: "maple:drafts:feat/other" }));
    expect(maple.getState().drafts).toHaveLength(1);
  });
});

/** A paragraph on the page, selected the way a reviewer's drag selects it. */
function selectParagraph(): HTMLElement {
  const paragraph = document.createElement("p");
  paragraph.textContent = "The spacing under the heading is inconsistent.";
  paragraph.dataset["test"] = "";
  document.body.append(paragraph);

  const range = document.createRange();
  range.selectNodeContents(paragraph);
  getSelection()?.removeAllRanges();
  getSelection()?.addRange(range);
  return paragraph;
}

/** Copying a paragraph must not close the composer. This is that test. */
describe("the c shortcut over a real page", () => {
  it("arms a text pick of the passage already selected on the page", () => {
    const maple = client();
    const paragraph = selectParagraph();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
    expect(maple.getState().pick).toEqual({ armed: true, kind: "text" });

    paragraph.remove();
  });

  it("does not remember a text pick it took from a selection as the viewer's choice", () => {
    const maple = client();
    maple.arm("region");
    maple.disarm();
    const paragraph = selectParagraph();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
    maple.disarm();

    getSelection()?.removeAllRanges();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
    expect(maple.getState().pick).toEqual({ armed: true, kind: "region" });
    paragraph.remove();
  });

  it("arms the remembered kind when the selection is collapsed", () => {
    const maple = client();
    getSelection()?.removeAllRanges();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
    expect(maple.getState().pick).toEqual({ armed: true, kind: "element" });
  });

  it("moves on to the next kind when pressed again while armed", () => {
    const maple = client();
    const press = () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));

    press();
    expect(maple.getState().pick).toEqual({ armed: true, kind: "element" });
    press();
    expect(maple.getState().pick.kind).toBe("text");
    press();
    expect(maple.getState().pick.kind).toBe("region");
    press();
    expect(maple.getState().pick.kind).toBe("element");
  });

  it("starts from the kind armed last, on this controller or the one before", () => {
    client().arm("region");
    maple?.destroy();

    const next = client();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));
    expect(next.getState().pick).toEqual({ armed: true, kind: "region" });
  });

  it("does nothing for the copy shortcut", () => {
    const maple = client();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true }),
    );
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "c", metaKey: true, bubbles: true }),
    );

    expect(maple.getState().pick.armed).toBe(false);
  });

  it("does nothing while the reviewer is typing in the page's own field", () => {
    const maple = client();
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));

    expect(maple.getState().pick.armed).toBe(false);
    field.remove();
  });

  it("does nothing while the reviewer is typing in a field inside a shadow root", () => {
    const maple = client();
    const host = document.createElement("div");
    const field = document.createElement("input");
    host.attachShadow({ mode: "open" }).append(field);
    document.body.append(host);
    field.focus();
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true, composed: true }));

    expect(maple.getState().pick.armed).toBe(false);
    host.remove();
  });
});

/** The poll a started controller runs, over the fetch seam so no origin is reached. */
describe("polling once started", () => {
  function route(status: () => string): typeof globalThis.fetch {
    return (input: RequestInfo | URL) => {
      const url = String(input instanceof Request ? input.url : input);
      const comments = [storedComment({ id: "c_1", status: status() as "open" })];
      const body = url.includes("/comments") ? { comments } : { user: null };
      const ok = !url.includes("/approvals");
      return Promise.resolve(
        new Response(JSON.stringify(ok ? body : { error: "none" }), {
          status: ok ? 200 : 501,
          headers: { "content-type": "application/json" },
        }),
      );
    };
  }

  it("shows a comment resolved elsewhere without a reload, and stops on destroy", async () => {
    let status = "open";
    maple = createMapleClient({
      branch: BRANCH,
      now: () => NOW,
      pollMs: 20,
      fetch: route(() => status),
    });
    maple.start();
    await maple.load();
    expect(maple.getState().openCount).toBe(1);

    status = "resolved";
    await vi.waitFor(() => expect(maple?.getState().comments[0]?.status).toBe("resolved"));

    const stopped = maple;
    stopped.destroy();
    status = "open";
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(stopped.getState().comments[0]?.status).toBe("resolved");
  });
});
