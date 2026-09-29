import { describe, expect, it } from "vitest";

import {
  capturePairing,
  forgetPairing,
  parsePairing,
  SOLO_HEADER,
  SOLO_PARAM,
  soloLink,
} from "../src/client/solo.js";
import { createTransport } from "../src/client/transport.js";

import type { CaptureOptions, Pairing } from "../src/client/solo.js";

const TOKEN = "abcdefghijklmnopqrstuvwxyz012345";
const BRIDGE = "http://127.0.0.1:52411";
const PAIRED = `#maple-solo=${TOKEN}&maple-bridge=${encodeURIComponent(BRIDGE)}`;

/** The address a `fetch` was given, whichever of its three forms it took. */
function addressOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

function storage(): Storage {
  const held = new Map<string, string>();
  return {
    get length() {
      return held.size;
    },
    clear: () => held.clear(),
    getItem: (key) => held.get(key) ?? null,
    key: (index) => [...held.keys()][index] ?? null,
    removeItem: (key) => {
      held.delete(key);
    },
    setItem: (key, value) => {
      held.set(key, value);
    },
  };
}

/** A page whose address the test can read back after `replaceState`. */
function page(hash: string, pathname = "/menu", search = "?x=1") {
  const location = { hash, origin: "https://feat-x.preview.example", pathname, search };
  const replaced: string[] = [];
  const history = {
    state: { from: "host" },
    replaceState: (_state: unknown, _title: string, address: string) => {
      replaced.push(address);
      location.hash = address.includes("#") ? address.slice(address.indexOf("#")) : "";
    },
  };
  return { location, history, replaced };
}

describe("reading a pairing out of a fragment", () => {
  it.each<[string, string, Pairing | undefined]>([
    ["a pairing", PAIRED, { bridge: BRIDGE, token: TOKEN }],
    ["one with no leading hash", PAIRED.slice(1), { bridge: BRIDGE, token: TOKEN }],
    [
      "a localhost bridge",
      `#maple-solo=${TOKEN}&maple-bridge=http%3A%2F%2Flocalhost%3A8080`,
      { bridge: "http://localhost:8080", token: TOKEN },
    ],
    ["no fragment", "", undefined],
    ["another fragment", "#section-2", undefined],
    ["a token with no bridge", `#maple-solo=${TOKEN}`, undefined],
    ["a bridge with no token", `#maple-bridge=${encodeURIComponent(BRIDGE)}`, undefined],
    ["a short token", `#maple-solo=abc&maple-bridge=${encodeURIComponent(BRIDGE)}`, undefined],
    [
      "a token with a slash",
      `#maple-solo=${TOKEN}/..&maple-bridge=${encodeURIComponent(BRIDGE)}`,
      undefined,
    ],
    [
      "a bridge that is another host",
      `#maple-solo=${TOKEN}&maple-bridge=http%3A%2F%2Fevil.example%3A80`,
      undefined,
    ],
    [
      "a bridge that only starts like loopback",
      `#maple-solo=${TOKEN}&maple-bridge=http%3A%2F%2F127.0.0.1.evil.example%3A80`,
      undefined,
    ],
    [
      "a bridge over https",
      `#maple-solo=${TOKEN}&maple-bridge=https%3A%2F%2F127.0.0.1%3A80`,
      undefined,
    ],
    [
      "a bridge with no port",
      `#maple-solo=${TOKEN}&maple-bridge=http%3A%2F%2F127.0.0.1`,
      undefined,
    ],
    [
      "a bridge with a path",
      `#maple-solo=${TOKEN}&maple-bridge=http%3A%2F%2F127.0.0.1%3A80%2Fx`,
      undefined,
    ],
  ])("%s", (_case, hash, expected) => {
    expect(parsePairing(hash)).toEqual(expected);
  });

  it("round-trips through the link the bridge prints, replacing any fragment", () => {
    const link = soloLink("https://feat-x.preview.example/menu?x=1#old", {
      bridge: BRIDGE,
      token: TOKEN,
    });

    expect(link.startsWith("https://feat-x.preview.example/menu?x=1#")).toBe(true);
    expect(parsePairing(new URL(link).hash)).toEqual({ bridge: BRIDGE, token: TOKEN });
  });
});

describe("capturing a pairing as the script runs", () => {
  it("takes the fragment out of the address, keeping the path, the query and the history state", () => {
    const { location, history, replaced } = page(PAIRED);

    const found = capturePairing({ location, history, storage: storage() });

    expect(found).toEqual({ bridge: BRIDGE, token: TOKEN });
    expect(replaced).toEqual(["/menu?x=1"]);
    expect(location.hash).toBe("");
  });

  it("leaves a fragment the host application uses for itself", () => {
    const { location, history, replaced } = page(`${PAIRED}&tab=roasts`);

    capturePairing({ location, history, storage: storage() });

    expect(replaced).toEqual(["/menu?x=1#tab=roasts"]);
  });

  it("keeps it for that preview, so the next page load needs no fragment", () => {
    const held = storage();
    capturePairing({ ...page(PAIRED), storage: held });

    const later = capturePairing({ ...page(""), storage: held });

    expect(later).toEqual({ bridge: BRIDGE, token: TOKEN });
  });

  it("keeps one preview's pairing from another's", () => {
    const held = storage();
    capturePairing({ ...page(PAIRED), storage: held });

    const other = {
      ...page(""),
      location: { ...page("").location, origin: "https://other.example" },
    };

    expect(capturePairing({ ...other, storage: held })).toBeUndefined();
  });

  it("reads nothing and writes nothing for a page that was never paired", () => {
    const { location, history, replaced } = page("");
    const held = storage();

    expect(capturePairing({ location, history, storage: held })).toBeUndefined();
    expect(replaced).toEqual([]);
    expect(held).toHaveLength(0);
  });

  it("ignores a stored value that is no longer a pairing", () => {
    const held = storage();
    held.setItem(
      "maple:solo:https://feat-x.preview.example",
      JSON.stringify({ bridge: "http://evil.example:1", token: TOKEN }),
    );

    expect(capturePairing({ ...page(""), storage: held })).toBeUndefined();
  });

  it("holds it in memory for the page where storage is blocked, and still cleans the address", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    const { location, history } = page(PAIRED, "/blocked");
    const options: CaptureOptions = { location, history, storage: blocked };

    expect(capturePairing(options)?.token).toBe(TOKEN);
    expect(location.hash).toBe("");
    expect(capturePairing(options)?.token).toBe(TOKEN);

    forgetPairing(options);
    expect(capturePairing(options)).toBeUndefined();
  });

  it("forgets a pairing, and is a guest again", () => {
    const held = storage();
    const options = { ...page(PAIRED), storage: held };
    capturePairing(options);

    forgetPairing(options);

    expect(
      capturePairing({ ...options, location: { ...options.location, hash: "" } }),
    ).toBeUndefined();
  });

  it("survives a history.replaceState that throws", () => {
    const { location } = page(PAIRED);
    const history = {
      state: null,
      replaceState: () => {
        throw new Error("sandboxed");
      },
    };

    expect(capturePairing({ location, history, storage: storage() })?.token).toBe(TOKEN);
  });
});

describe("the transport, paired", () => {
  function recorder() {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetcher = (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: addressOf(input), init: init ?? {} });
      return Promise.resolve(
        new Response(JSON.stringify({ comments: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    };
    return { seen, fetcher };
  }

  it("sends every call to the bridge with the token and no cookies", async () => {
    const { seen, fetcher } = recorder();
    const transport = createTransport({
      branch: "feat/x",
      basePath: "/somewhere/else",
      fetch: fetcher,
      solo: { bridge: BRIDGE, token: TOKEN },
    });

    await transport.list();
    await transport.me();

    expect(seen.map((call) => call.url)).toEqual([
      `${BRIDGE}/api/maple/comments?branch=feat%2Fx`,
      `${BRIDGE}/api/maple/me`,
    ]);
    for (const { init } of seen) {
      expect(init.credentials).toBe("omit");
      expect((init.headers as Record<string, string>)[SOLO_HEADER]).toBe(TOKEN);
    }
  });

  it("puts the token in a screenshot's address, which an img cannot send a header for", () => {
    const transport = createTransport({ branch: "b", solo: { bridge: BRIDGE, token: TOKEN } });

    const url = new URL(
      transport.mediaUrl({ connector: "file", key: "shot-1", contentType: "image/png" }),
    );

    expect(url.origin).toBe(BRIDGE);
    expect(url.searchParams.get(SOLO_PARAM)).toBe(TOKEN);
  });

  it("is the host's own route, with no token anywhere, when unpaired", async () => {
    const { seen, fetcher } = recorder();
    const transport = createTransport({ branch: "b", fetch: fetcher });

    await transport.list();

    expect(seen[0]?.url).toBe("/api/maple/comments?branch=b");
    expect(seen[0]?.init.credentials).toBe("same-origin");
    expect(JSON.stringify(seen[0]?.init.headers)).not.toContain(SOLO_HEADER);
    expect(
      transport.mediaUrl({ connector: "c", key: "k", contentType: "image/png" }),
    ).not.toContain(SOLO_PARAM);
  });
});
