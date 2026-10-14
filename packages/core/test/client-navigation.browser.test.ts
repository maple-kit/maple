import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMapleClient } from "../src/client/index.js";

import type {
  ClientView,
  ComposerTarget,
  LeaveAnswer,
  LeaveQuestion,
  MapleClient,
} from "../src/client/index.js";

const BRANCH = "feat/x";
const NOW = Date.parse("2026-09-18T10:00:00.000Z");
const TARGET: ComposerTarget = { kind: "element", anchor: { component: "YieldCard" } };

let maple: MapleClient | undefined;

/** The real document and history; only `location.assign` is a spy, so the
 * test page is never actually taken away by a Discard. */
function viewWith(assign: (url: string) => void): ClientView {
  return {
    document,
    history: window.history,
    location: { href: location.href, origin: location.origin, assign },
    addEventListener: (type, listener, options) => window.addEventListener(type, listener, options),
    removeEventListener: (type, listener, options) =>
      window.removeEventListener(type, listener, options),
    matchMedia: (query) => window.matchMedia(query),
    getComputedStyle: (element) => window.getComputedStyle(element),
  };
}

interface Harness {
  readonly ask: ReturnType<typeof vi.fn>;
  readonly assign: ReturnType<typeof vi.fn>;
  readonly maple: MapleClient;
}

function dirtyClient(answer: LeaveAnswer): Harness {
  const ask = vi.fn((_question: LeaveQuestion): LeaveAnswer => answer);
  const assign = vi.fn();
  const client = createMapleClient({
    branch: BRANCH,
    now: () => NOW,
    debounceMs: 5000,
    view: viewWith(assign),
    askToLeave: ask,
  });

  maple = client;
  client.start();
  client.openComposer(TARGET);
  client.setBody("The spacing under the heading is off.");
  return { ask, assign, maple: client };
}

/** A client wired to no surface at all: the headless default. */
function silentClient(assign: () => void): MapleClient {
  const client = createMapleClient({
    branch: BRANCH,
    now: () => NOW,
    debounceMs: 5000,
    view: viewWith(assign),
  });

  maple = client;
  client.start();
  client.openComposer(TARGET);
  client.setBody("The spacing under the heading is off.");
  return client;
}

function anchor(attributes: Record<string, string> = {}): HTMLAnchorElement {
  const link = document.createElement("a");
  link.href = attributes["href"] ?? "/elsewhere";
  link.textContent = "Elsewhere";
  link.dataset["test"] = "";
  for (const [name, value] of Object.entries(attributes)) link.setAttribute(name, value);
  document.body.append(link);
  return link;
}

/**
 * A real click on a real anchor. A window listener added after the guard's
 * stops the browser actually leaving, and reports what the guard decided.
 */
function click(link: HTMLAnchorElement, init: MouseEventInit = {}): boolean {
  let prevented = false;
  const swallow = (event: Event): void => {
    prevented = event.defaultPrevented;
    event.preventDefault();
  };

  window.addEventListener("click", swallow);
  link.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, composed: true, ...init }),
  );
  window.removeEventListener("click", swallow);
  return prevented;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  maple?.destroy();
  maple = undefined;
  for (const link of document.querySelectorAll("a[data-test]")) link.remove();
});

/**
 * The design document's layer three: while dirty, prevent the default and ask
 * once. The controller renders nothing — it hands the surface the question.
 */
describe("a click on a link while a comment is unsent", () => {
  it("names what is at stake and asks exactly once for that draft", async () => {
    const { ask, maple: client } = dirtyClient("keep");
    const link = anchor();

    expect(click(link)).toBe(true);
    await vi.waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
    expect(ask.mock.calls[0]?.[0]).toEqual({
      reason: "anchor",
      subject: { id: client.getState().composer.draftId, label: "Yield card" },
      href: link.href,
    });

    expect(click(link)).toBe(false);
    expect(click(anchor({ href: "/third" }))).toBe(false);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("saves before it asks, so the answer cannot cost the draft", async () => {
    const { ask } = dirtyClient("keep");
    click(anchor());

    expect(localStorage.getItem(`maple:drafts:${BRANCH}`)).toContain("spacing under the heading");
    await vi.waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
  });

  it("stays on the page when the reviewer keeps writing", async () => {
    const { ask, assign, maple: client } = dirtyClient("keep");
    click(anchor());

    await vi.waitFor(() => expect(ask).toHaveBeenCalledTimes(1));
    expect(assign).not.toHaveBeenCalled();
    expect(client.getState().composer.open).toBe(true);
    expect(client.getState().drafts).toHaveLength(1);
  });

  it("discards the draft and then performs the navigation it prevented", async () => {
    const { assign, maple: client } = dirtyClient("discard");
    const link = anchor();

    expect(click(link)).toBe(true);
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(link.href));
    expect(client.getState().drafts).toEqual([]);
    expect(client.getState().composer.open).toBe(false);
  });

  it("waits for a surface that answers only once a dialog is dismissed", async () => {
    let settle: ((answer: LeaveAnswer) => void) | undefined;
    const assign = vi.fn();
    const client = createMapleClient({
      branch: BRANCH,
      now: () => NOW,
      debounceMs: 5000,
      view: viewWith(assign),
      askToLeave: () =>
        new Promise<LeaveAnswer>((resolve) => {
          settle = resolve;
        }),
    });

    maple = client;
    client.start();
    client.openComposer(TARGET);
    client.setBody("The spacing under the heading is off.");

    const link = anchor();
    expect(click(link)).toBe(true);
    await vi.waitFor(() => expect(settle).toBeDefined());
    expect(assign).not.toHaveBeenCalled();

    settle?.("discard");
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(link.href));
  });
});

/** Without a surface to ask, the layer is exactly what it has always been. */
describe("a client that supplied no way to ask", () => {
  it("saves, does not prevent, and lets the click through", () => {
    const assign = vi.fn();
    silentClient(assign);

    expect(click(anchor())).toBe(false);
    expect(localStorage.getItem(`maple:drafts:${BRANCH}`)).toContain("spacing under the heading");
    expect(assign).not.toHaveBeenCalled();
  });
});

/**
 * A link Maple must never stand in front of. Each of these is a navigation the
 * browser handles its own way, and intercepting it is a bug a reviewer feels.
 */
describe("a link that is not this page's to intercept", () => {
  const cases = [
    { name: "a cross-origin link", attributes: { href: "https://example.com/pricing" }, init: {} },
    { name: "a link opened in a new tab", attributes: {}, init: { metaKey: true } },
    { name: "a link the reviewer control-clicked", attributes: {}, init: { ctrlKey: true } },
    { name: "a download", attributes: { download: "" }, init: {} },
    { name: "a hash-only link", attributes: { href: "#" }, init: {} },
    { name: "a link to a hash on this page", attributes: { href: "#section" }, init: {} },
    { name: "a link targeting another frame", attributes: { target: "_blank" }, init: {} },
  ];

  it.each(cases)("is never asked about: $name", async ({ attributes, init }) => {
    const { ask } = dirtyClient("keep");

    expect(click(anchor(attributes), init)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(ask).not.toHaveBeenCalled();
  });
});

/** The host's own handler runs before the guard decides, so it wins. */
describe("a link the host already handled", () => {
  it("is not asked about when an onClick prevented the default", async () => {
    const { ask } = dirtyClient("keep");
    const link = anchor();
    link.addEventListener("click", (event) => event.preventDefault());

    expect(click(link)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(ask).not.toHaveBeenCalled();
  });

  it("is not asked about when a root-level router prevents a page link", async () => {
    const { ask, assign } = dirtyClient("discard");
    const router = (event: Event): void => event.preventDefault();
    document.body.addEventListener("click", router);
    try {
      expect(click(anchor())).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 10));
    } finally {
      document.body.removeEventListener("click", router);
    }

    expect(ask).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});
