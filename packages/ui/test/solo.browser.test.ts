import { createMapleClient } from "@maple-kit/core/client";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { MapleRoot } from "../src/index.js";
import { Island, IslandContent, List, Unsent } from "../src/island/index.js";
import { MapleNotice } from "../src/notice/index.js";
import { SOLO_COPY } from "../src/solo.js";

import type { MapleClient } from "@maple-kit/core/client";
import type { ReactElement } from "react";

const BRANCH = "feat/ui-solo";
const ORIGIN = "https://preview.example";
const BRIDGE = "http://127.0.0.1:52411";
const TOKEN = "abcdefghijklmnopqrstuvwxyz012345";
const START = `${location.pathname}${location.search}`;

let client: MapleClient;
let copiedText = "";

/** The address a `fetch` was given, whichever of its three forms it took. */
function addressOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A route with nobody signed in and, by default, a store that refuses. */
function guestFetch(refuse: boolean): typeof fetch {
  return (input) => {
    const url = addressOf(input);
    if (url.includes("/me")) return Promise.resolve(json({ user: null }, 200));
    if (url.includes("/approvals")) return Promise.resolve(json({ error: "none" }, 501));
    return Promise.resolve(refuse ? json({ error: "sign in" }, 401) : json({ comments: [] }, 200));
  };
}

function tree(fetcher: typeof fetch): ReactElement {
  client = createMapleClient({
    branch: BRANCH,
    fetch: fetcher,
    origin: ORIGIN,
    debounceMs: 0,
    confirmOnUnload: false,
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
        createElement(MapleNotice),
        createElement(List),
        createElement(Unsent),
      ),
    ),
  );
}

function root(): ShadowRoot {
  const host = document.querySelector<HTMLElement>("[data-maple-overlay]");
  if (!host?.shadowRoot) throw new Error("no overlay is mounted");
  return host.shadowRoot;
}

function offer(): HTMLElement | null {
  return root().querySelector<HTMLElement>(".mk-solo");
}

function keep(): void {
  client.openComposer({ kind: "element", anchor: { component: "YieldCard" } });
  client.setBody("The spacing is off.");
  client.keepDraft();
}

beforeEach(() => {
  localStorage.clear();
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
  localStorage.clear();
  history.replaceState(null, "", START);
});

describe("the offer to a guest", () => {
  it("is one line under the unsent list, with the command in it", async () => {
    await render(tree(guestFetch(false)));
    await vi.waitFor(() => expect(client.getState().phase).toBe("ready"));
    keep();

    await vi.waitFor(() => expect(offer()).not.toBeNull());
    expect(offer()?.textContent).toBe(
      "Can't sign in? Run maple solo to keep comments on your machine",
    );
    expect(offer()?.querySelector("button")?.textContent).toBe("maple solo");
  });

  it("copies the command, addressed to this page, when it is pressed", async () => {
    await render(tree(guestFetch(false)));
    await vi.waitFor(() => expect(client.getState().phase).toBe("ready"));
    keep();
    await vi.waitFor(() => expect(offer()).not.toBeNull());

    offer()?.querySelector("button")?.click();

    await vi.waitFor(() => expect(copiedText).toBe(`maple solo ${location.origin}`));
    await vi.waitFor(() =>
      expect(offer()?.querySelector("[role=status]")?.textContent).toContain(SOLO_COPY.copied),
    );
  });

  it("is under a refusal too, where the guest learns nothing can be posted", async () => {
    await render(tree(guestFetch(true)));

    await vi.waitFor(() => expect(root().querySelector(".mk-notice .mk-solo")).not.toBeNull());
  });

  it("is not drawn for a page that is already paired", async () => {
    const paired = `maple-solo=${TOKEN}&maple-bridge=${encodeURIComponent(BRIDGE)}`;
    history.replaceState(null, "", `${START}#${paired}`);
    await render(tree(guestFetch(false)));
    await vi.waitFor(() => expect(client.getState().phase).toBe("ready"));

    keep();

    await vi.waitFor(() => expect(root().querySelector(".mk-unsent")).not.toBeNull());
    expect(offer()).toBeNull();
  });

  it("is not drawn for a reviewer who is signed in", async () => {
    const signedIn: typeof fetch = (input) => {
      const url = addressOf(input);
      if (url.includes("/me")) return Promise.resolve(json({ user: { id: "u_7" } }, 200));
      if (url.includes("/approvals")) return Promise.resolve(json({ error: "none" }, 501));
      return Promise.resolve(json({ comments: [] }, 200));
    };
    await render(tree(signedIn));
    await vi.waitFor(() => expect(client.getState().user).not.toBeNull());

    keep();

    await vi.waitFor(() => expect(root().querySelector(".mk-unsent")).not.toBeNull());
    expect(offer()).toBeNull();
  });
});

describe("a paired page whose bridge has gone", () => {
  it("says so and offers the way back, rather than asking for a sign-in", async () => {
    const paired = `maple-solo=${TOKEN}&maple-bridge=${encodeURIComponent(BRIDGE)}`;
    history.replaceState(null, "", `${START}#${paired}`);
    const gone: typeof fetch = () => Promise.reject(new TypeError("Failed to fetch"));
    await render(tree(gone));

    await vi.waitFor(() => expect(root().querySelector(".mk-notice")).not.toBeNull());
    const notice = root().querySelector<HTMLElement>(".mk-notice")!;
    expect(notice.textContent).toContain(SOLO_COPY.gone);
    expect(notice.textContent).not.toContain("Sign in");

    notice.querySelector<HTMLButtonElement>(".mk-notice-do")?.click();

    await vi.waitFor(() => expect(client.getState().solo).toBe(false));
  });
});
