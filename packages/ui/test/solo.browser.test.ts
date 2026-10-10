import { createMapleClient } from "@maple-kit/core/client";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";

import { MapleRoot } from "../src/index.js";
import { Island, IslandContent, List, SignIn } from "../src/island/index.js";
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
    if (url.includes("/me")) {
      return Promise.resolve(json({ user: null, github: { linked: false } }, 200));
    }
    if (url.includes("/auth/github")) {
      return Promise.resolve(
        json(
          {
            userCode: "WDJB-MJHT",
            verificationUri: "https://github.com/login/device",
            expiresAt: Date.now() + 900_000,
            interval: 5,
            status: "pending",
          },
          200,
        ),
      );
    }
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
      createElement(IslandContent, null, createElement(MapleNotice), createElement(List)),
    ),
    createElement(SignIn),
  );
}

function root(): ShadowRoot {
  const host = document.querySelector<HTMLElement>("[data-maple-overlay]");
  if (!host?.shadowRoot) throw new Error("no overlay is mounted");
  return host.shadowRoot;
}

function offer(): HTMLElement | null {
  return root().querySelector<HTMLElement>(".mk-step-help .mk-link");
}

function popups(): HTMLDialogElement[] {
  return [...root().querySelectorAll<HTMLDialogElement>(".mk-popup")];
}

/** Presses the notice's Sign in, and waits for the popup it opens. */
async function signInPopup(): Promise<void> {
  await vi.waitFor(() => expect(root().querySelector(".mk-notice .mk-link")).not.toBeNull());
  await userEvent.click(root().querySelector<HTMLElement>(".mk-notice .mk-link")!, {
    timeout: 2000,
  });
  await vi.waitFor(() => expect(offer()).not.toBeNull());
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
  it("is not in the notice, which only has the sign-in to offer", async () => {
    await render(tree(guestFetch(true)));
    await vi.waitFor(() => expect(root().querySelector(".mk-notice")).not.toBeNull());

    expect(root().querySelectorAll(".mk-notice .mk-link")).toHaveLength(1);
    expect(root().querySelector(".mk-notice .mk-link")?.textContent).toBe("Sign in");
    expect(offer()).toBeNull();
  });

  it("is a link in the sign-in popup, and the command is in the popup it opens", async () => {
    await render(tree(guestFetch(true)));
    await signInPopup();
    expect(offer()?.textContent).toBe("Can't sign in?");
    expect(popups()).toHaveLength(1);

    await userEvent.click(offer()!, { timeout: 2000 });

    await vi.waitFor(() => expect(popups()).toHaveLength(2));
    expect(popups()[1]?.open).toBe(true);
    expect(popups()[1]?.textContent).toContain(`maple solo ${location.origin}`);
  });

  it("copies the command, addressed to this page, when Copy is pressed", async () => {
    await render(tree(guestFetch(true)));
    await signInPopup();
    await userEvent.click(offer()!, { timeout: 2000 });
    await vi.waitFor(() => expect(popups()).toHaveLength(2));

    const copy = popups()[1]!.querySelector<HTMLButtonElement>(".mk-acct-do")!;
    await userEvent.click(copy, { timeout: 2000 });

    await vi.waitFor(() => expect(copiedText).toBe(`maple solo ${location.origin}`));
    await vi.waitFor(() =>
      expect(popups()[1]?.querySelector(".mk-acct-do")?.textContent).toBe(SOLO_COPY.copied),
    );
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

    notice.querySelector<HTMLButtonElement>(".mk-link")?.click();

    await vi.waitFor(() => expect(client.getState().solo).toBe(false));
  });
});
