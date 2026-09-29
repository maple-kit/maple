import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  capturePairing,
  createMapleClient,
  forgetPairing,
  SOLO_HEADER,
} from "../src/client/index.js";

import type { MapleClient } from "../src/client/index.js";

const BRIDGE = "http://127.0.0.1:52411";
const TOKEN = "abcdefghijklmnopqrstuvwxyz012345";
const ORIGIN = "https://feat-x.preview.example";
const BRANCH = "feat/x";
const PAIRED = `maple-solo=${TOKEN}&maple-bridge=${encodeURIComponent(BRIDGE)}`;

const START = `${location.pathname}${location.search}`;

let client: MapleClient | undefined;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  client?.destroy();
  client = undefined;
  forgetPairing({ origin: ORIGIN });
  localStorage.clear();
  history.replaceState(null, "", START);
  vi.restoreAllMocks();
});

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

/** A route that answers a guest: no session, no comments, and a refusal to post. */
function routeFetch(calls: Call[]): typeof fetch {
  return (input, init) => {
    const url = addressOf(input);
    calls.push({ url, init: init ?? {} });
    const method = init?.method ?? "GET";
    if (url.includes("/comments") && method === "POST") {
      const body = JSON.parse(init?.body as string) as { body: string }[];
      const made = body.map((one, index) => ({
        ...one,
        id: `c_${String(index)}`,
        status: "open",
        author: { id: "guest", name: "Guest", provenance: "guest" },
      }));
      return Promise.resolve(json({ comments: made }, 201));
    }
    if (url.includes("/me")) return Promise.resolve(json({ user: null, media: true }, 200));
    if (url.includes("/approvals")) return Promise.resolve(json({ error: "none" }, 501));
    return Promise.resolve(json({ comments: [] }, 200));
  };
}

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

function open(calls: Call[]): MapleClient {
  client = createMapleClient({
    branch: BRANCH,
    origin: ORIGIN,
    fetch: routeFetch(calls),
    debounceMs: 0,
    confirmOnUnload: false,
  });
  client.start();
  return client;
}

describe("a page opened from the link `maple solo` printed", () => {
  it("takes the pairing out of the address bar as soon as the client exists", () => {
    history.replaceState(null, "", `${START}#${PAIRED}`);
    expect(location.hash).toContain("maple-solo");

    open([]);

    expect(location.hash).toBe("");
    expect(`${location.pathname}${location.search}`).toBe(START);
  });

  it("leaves the history no longer than it was", () => {
    const before = history.length;
    history.replaceState(null, "", `${START}#${PAIRED}`);

    open([]);

    expect(history).toHaveLength(before);
  });

  it("keeps a fragment the host application uses for itself", () => {
    history.replaceState(null, "", `${START}#${PAIRED}&tab=roasts`);

    open([]);

    expect(location.hash).toBe("#tab=roasts");
  });

  it("sends its calls to the bridge with the token, and to nothing else", async () => {
    history.replaceState(null, "", `${START}#${PAIRED}`);
    const calls: Call[] = [];
    const maple = open(calls);

    await maple.load();

    expect(maple.getState().solo).toBe(true);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.url.startsWith(`${BRIDGE}/api/maple/`)).toBe(true);
      expect((call.init.headers as Record<string, string>)[SOLO_HEADER]).toBe(TOKEN);
      expect(call.init.credentials).toBe("omit");
    }
  });

  it("publishes a comment to the bridge, where it becomes a stored comment and not a draft", async () => {
    history.replaceState(null, "", `${START}#${PAIRED}`);
    const calls: Call[] = [];
    const maple = open(calls);
    await maple.load();

    maple.openComposer({ kind: "element", anchor: { component: "YieldCard" } });
    maple.setBody("The spacing under the heading is off.");
    await maple.publish();

    const post = calls.find((call) => call.init.method === "POST");
    expect(post?.url).toBe(`${BRIDGE}/api/maple/comments`);
    expect(maple.getState().comments).toHaveLength(1);
    expect(maple.getState().drafts).toHaveLength(0);
  });

  it("stays paired through a client-side navigation, for the client and for the next one", async () => {
    history.replaceState(null, "", `${START}#${PAIRED}`);
    const calls: Call[] = [];
    const maple = open(calls);
    await maple.load();

    history.pushState({}, "", "/menu/roasts");
    history.pushState({}, "", "/menu/roasts?roast=light#top");
    calls.length = 0;
    await maple.refresh();
    await maple.load();

    expect(maple.getState().solo).toBe(true);
    expect(calls.every((call) => call.url.startsWith(BRIDGE))).toBe(true);
    expect(capturePairing({ origin: ORIGIN })).toEqual({ bridge: BRIDGE, token: TOKEN });

    maple.destroy();
    const remounted = open([]);
    expect(remounted.getState().solo).toBe(true);
  });

  it("keeps it in localStorage for that preview, under the key the guard reads", () => {
    history.replaceState(null, "", `${START}#${PAIRED}`);

    open([]);

    const stored = localStorage.getItem(`maple:solo:${ORIGIN}`);
    expect(JSON.parse(stored ?? "null")).toEqual({ bridge: BRIDGE, token: TOKEN });
  });

  it("goes back to the route when the reviewer leaves solo mode", async () => {
    history.replaceState(null, "", `${START}#${PAIRED}`);
    const calls: Call[] = [];
    const maple = open(calls);
    await maple.load();

    calls.length = 0;
    await maple.endSolo();

    expect(maple.getState().solo).toBe(false);
    expect(calls.map((call) => call.url).every((url) => url.startsWith("/api/maple/"))).toBe(true);
    expect(localStorage.getItem(`maple:solo:${ORIGIN}`)).toBeNull();
  });
});

describe("a guest who never ran `maple solo`", () => {
  it("makes no request to localhost, whatever it does", async () => {
    const seen: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      seen.push(addressOf(input));
      const method = init?.method ?? "GET";
      return Promise.resolve(
        method === "POST"
          ? json({ error: "sign in" }, 401)
          : json({ user: null, comments: [] }, 200),
      );
    });
    const open = vi.spyOn(XMLHttpRequest.prototype, "open");
    const beacon = vi.spyOn(navigator, "sendBeacon");

    client = createMapleClient({ branch: BRANCH, origin: ORIGIN, debounceMs: 0 });
    client.start();
    await client.load();
    client.openComposer({ kind: "element", anchor: { component: "YieldCard" } });
    client.setBody("The spacing under the heading is off.");
    await client.publish().catch(() => undefined);
    await client.refresh();

    expect(client.getState().solo).toBe(false);
    expect(seen.length).toBeGreaterThan(0);
    for (const url of seen) {
      expect(new URL(url, location.href).origin).toBe(location.origin);
      expect(url).not.toContain("127.0.0.1");
    }
    expect(open).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
  });

  it("is not paired by a fragment that only looks like a pairing", () => {
    const named = `maple-solo=${TOKEN}&maple-bridge=${encodeURIComponent("http://evil.example:80")}`;
    history.replaceState(null, "", `${START}#${named}`);

    open([]);

    expect(client?.getState().solo).toBe(false);
    expect(localStorage.getItem(`maple:solo:${ORIGIN}`)).toBeNull();
  });
});
