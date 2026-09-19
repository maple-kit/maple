import { describe, expect, it, vi } from "vitest";

import {
  MAPLE_DEFAULTS,
  nearestCorner,
  parseMapleQuery,
  readPreferences,
  resolveConfig,
  writePreferences,
} from "../src/client/preferences.js";

import type { ConfigInput } from "../src/client/preferences.js";
import type { Corner, Detail } from "../src/client/types.js";
import type { Logger } from "../src/logger/types.js";

/** A storage that keeps what it is given and nothing else. */
function memoryStorage(seed: Record<string, string> = {}): Storage {
  const held = new Map(Object.entries(seed));
  return {
    get length() {
      return held.size;
    },
    clear: () => held.clear(),
    getItem: (key: string) => held.get(key) ?? null,
    key: (index: number) => [...held.keys()][index] ?? null,
    removeItem: (key: string) => held.delete(key),
    setItem: (key: string, value: string) => held.set(key, value),
  };
}

/** A storage that throws on every access, as a private window's does. */
function hostileStorage(): Storage {
  const refuse = (): never => {
    throw new Error("site data is blocked");
  };
  return {
    getItem: refuse,
    setItem: refuse,
    removeItem: refuse,
    clear: refuse,
  } as unknown as Storage;
}

const ORIGIN = "https://preview.example";
const TOP_LEFT: Corner = "top-left";
const BOTTOM_LEFT: Corner = "bottom-left";
const TOP_RIGHT: Corner = "top-right";
const DEVELOPER: Detail = "developer";

describe("the query string", () => {
  it.each([
    ["?maple=off", { enabled: false }],
    ["?maple=on", { enabled: true }],
    ["?maple=yes", {}],
    ["?maple-pos=top-left", { position: "top-left" }],
    ["?maple-pos=middle", {}],
    ["?maple-detail=developer", { detail: "developer" }],
    ["?maple-detail=verbose", {}],
    ["?maple-comment=c7", { comment: "c7" }],
    ["?maple-comment=", {}],
    ["?maple-new=region", { pick: "region" }],
    ["?maple-new=sketch", {}],
    ["", {}],
    [
      "?maple=off&maple-pos=top-right&maple-new=text",
      {
        enabled: false,
        position: "top-right",
        pick: "text",
      },
    ],
  ])("reads %s as the parameters it actually carried", (search, expected) => {
    expect(parseMapleQuery(search)).toEqual(expected);
  });

  it("ignores a parameter belonging to the application", () => {
    expect(parseMapleQuery("?mapleSyrup=on&maplepos=top-left")).toEqual({});
  });
});

describe("precedence", () => {
  it.each([
    ["nothing anywhere", {}, MAPLE_DEFAULTS.position, MAPLE_DEFAULTS.detail],
    ["props alone", { props: { position: TOP_LEFT } }, "top-left", "default"],
    [
      "a stored preference over props",
      { props: { position: TOP_LEFT }, stored: { position: BOTTOM_LEFT } },
      "bottom-left",
      "default",
    ],
    [
      "the query string over both",
      {
        query: { position: TOP_RIGHT, detail: DEVELOPER },
        stored: { position: BOTTOM_LEFT },
        props: { position: TOP_LEFT },
      },
      "top-right",
      "developer",
    ],
  ])("takes %s", (_case, input, position, detail) => {
    const config = resolveConfig(input);
    expect(config.position).toBe(position);
    expect(config.detail).toBe(detail);
  });

  it.each<[string, ConfigInput, boolean]>([
    ["defaults to on", {}, true],
    ["is turned off by the link, always", { query: { enabled: false } }, false],
    [
      "is turned off by the link even when the application asked for it",
      { query: { enabled: false }, props: { enabled: true } },
      false,
    ],
    ["is turned on by the link when overrides are allowed", { query: { enabled: true } }, true],
    [
      "is never turned on over an application saying false",
      { query: { enabled: true }, props: { enabled: false } },
      false,
    ],
    [
      "is not turned on when overrides are refused",
      { query: { enabled: true }, props: { allowUrlOverride: false } },
      true,
    ],
    [
      "is still turned off when overrides are refused",
      { query: { enabled: false }, props: { allowUrlOverride: false } },
      false,
    ],
  ])("%s", (_case, input, expected) => {
    expect(resolveConfig(input).enabled).toBe(expected);
  });

  it("keeps the deep link and the armed pick the query asked for", () => {
    const config = resolveConfig({ query: { comment: "c4", pick: "text" } });
    expect(config.comment).toBe("c4");
    expect(config.pick).toBe("text");
  });

  it("carries the props that no link may change", () => {
    const config = resolveConfig({ props: { hideResolved: false, shortcut: "k" } });
    expect(config.hideResolved).toBe(false);
    expect(config.shortcut).toBe("k");
  });
});

describe("what the viewer is remembered for", () => {
  it("round-trips a preference through storage, keyed by origin", () => {
    const storage = memoryStorage();
    writePreferences({ detail: "developer", position: "top-left" }, { storage, origin: ORIGIN });

    expect(readPreferences({ storage, origin: ORIGIN })).toEqual({
      detail: "developer",
      position: "top-left",
    });
    expect(readPreferences({ storage, origin: "https://other.example" })).toEqual({});
  });

  it.each([
    ["nothing stored", memoryStorage()],
    ["a value that is not JSON", memoryStorage({ [`maple:prefs:${ORIGIN}`]: "{" })],
    [
      "a value that is no longer one of ours",
      memoryStorage({ [`maple:prefs:${ORIGIN}`]: '{"detail":"verbose"}' }),
    ],
  ])("reads %s as no preference at all", (_case, storage) => {
    expect(readPreferences({ storage, origin: ORIGIN })).toEqual({});
  });

  it("treats a storage that throws as no preference, and says so once", () => {
    const warn = vi.fn();
    const logger: Logger = {
      warn,
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      child: () => logger,
    };

    expect(readPreferences({ storage: hostileStorage(), origin: ORIGIN, logger })).toEqual({});
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("loses a write to a storage that throws rather than the page", () => {
    expect(() =>
      writePreferences({ detail: "developer" }, { storage: hostileStorage(), origin: ORIGIN }),
    ).not.toThrow();
  });
});

describe("the corner a drag lands in", () => {
  const frame = { top: 0, left: 0, width: 1000, height: 800 };

  it.each([
    [{ x: 10, y: 10 }, "top-left"],
    [{ x: 990, y: 10 }, "top-right"],
    [{ x: 10, y: 790 }, "bottom-left"],
    [{ x: 990, y: 790 }, "bottom-right"],
    [{ x: 499, y: 399 }, "top-left"],
    [{ x: 500, y: 400 }, "bottom-right"],
  ])("snaps %o to the nearest corner", (point, expected) => {
    expect(nearestCorner(point, frame)).toBe(expected);
  });

  it("measures from the frame rather than from the page", () => {
    expect(
      nearestCorner({ x: 120, y: 120 }, { top: 100, left: 100, width: 200, height: 200 }),
    ).toBe("top-left");
  });
});

/**
 * A viewer preference, not the application's: a reviewer comparing two
 * screenshots needs the choice to survive the next page they land on.
 */
describe("the theme the viewer chose", () => {
  it("defaults to auto, which is the opposite of the host page", () => {
    expect(resolveConfig({}).theme).toBe("auto");
    expect(MAPLE_DEFAULTS.theme).toBe("auto");
  });

  it("reads a link's theme off the query string", () => {
    expect(parseMapleQuery("?maple-theme=dark").theme).toBe("dark");
    expect(parseMapleQuery("?maple-theme=light").theme).toBe("light");
    expect(parseMapleQuery("?maple-theme=auto").theme).toBe("auto");
  });

  it("ignores a theme it does not recognise rather than defaulting it", () => {
    expect(parseMapleQuery("?maple-theme=sepia").theme).toBeUndefined();
  });

  it("takes the link, then the viewer, then the application", () => {
    const every: ConfigInput = {
      query: { theme: "light" },
      stored: { theme: "dark" },
      props: { theme: "auto" },
    };

    expect(resolveConfig(every).theme).toBe("light");
    expect(resolveConfig({ stored: { theme: "dark" }, props: { theme: "light" } }).theme).toBe(
      "dark",
    );
    expect(resolveConfig({ props: { theme: "light" } }).theme).toBe("light");
  });

  it("remembers it per origin, beside the other two", () => {
    const storage = memoryStorage();
    writePreferences(
      { detail: "developer", position: TOP_LEFT, theme: "dark" },
      { storage, origin: ORIGIN },
    );

    expect(readPreferences({ storage, origin: ORIGIN })).toEqual({
      detail: "developer",
      position: TOP_LEFT,
      theme: "dark",
    });
  });

  it("drops a stored theme that is no longer one of ours", () => {
    const storage = memoryStorage({
      [`maple:prefs:${ORIGIN}`]: JSON.stringify({ theme: "sepia", position: TOP_LEFT }),
    });

    expect(readPreferences({ storage, origin: ORIGIN })).toEqual({ position: TOP_LEFT });
  });
});
