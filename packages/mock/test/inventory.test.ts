import { createInventory, INVENTORY_STORAGE_KEY } from "@maple-kit/mock";
import { describe, expect, it } from "vitest";

import type { Sample } from "@maple-kit/mock";

/** A `Storage` over a map, so a node test needs no DOM. */
function memoryStorage(options: { full?: boolean } = {}) {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (options.full === true) throw new DOMException("full", "QuotaExceededError");
      map.set(key, value);
    },
  };
}

const sample = (key: string, body: unknown = [], at = 1): Sample => ({
  key,
  status: 200,
  body,
  at,
});

describe("createInventory", () => {
  it("keeps the last sample of each call, per route", () => {
    const inventory = createInventory();
    inventory.record("/projects", sample("rest:GET /a", [1], 1));
    inventory.record("/projects", sample("rest:GET /a", [2], 2));
    inventory.record("/projects", sample("rest:GET /b"));
    expect(inventory.calls("/projects").map((found) => found.key)).toEqual([
      "rest:GET /b",
      "rest:GET /a",
    ]);
    expect(inventory.sample("rest:GET /a", "/projects")?.body).toEqual([2]);
  });

  it("finds a call seen on another route", () => {
    const inventory = createInventory();
    inventory.record("/projects", sample("trpc:user.me", { id: 1 }));
    expect(inventory.sample("trpc:user.me", "/settings")?.body).toEqual({ id: 1 });
    expect(inventory.calls("/settings")).toEqual([]);
  });

  it("prefers the route it is asked about", () => {
    const inventory = createInventory();
    inventory.record("/a", sample("k:x", "from a"));
    inventory.record("/b", sample("k:x", "from b"));
    expect(inventory.sample("k:x", "/a")?.body).toBe("from a");
  });

  it("survives a reload through storage", () => {
    const storage = memoryStorage();
    createInventory({ storage }).record("/projects", sample("rest:GET /a", [1]));
    expect(createInventory({ storage }).sample("rest:GET /a", "/projects")?.body).toEqual([1]);
  });

  it("drops the oldest routes and calls past its limits", () => {
    const inventory = createInventory({ limits: { routes: 2, callsPerRoute: 2 } });
    for (const key of ["k:1", "k:2", "k:3"]) inventory.record("/a", sample(key));
    inventory.record("/b", sample("k:b"));
    inventory.record("/c", sample("k:c"));
    expect(inventory.calls("/a")).toEqual([]);
    expect(inventory.calls("/b").map((found) => found.key)).toEqual(["k:b"]);

    const kept = createInventory({ limits: { callsPerRoute: 2 } });
    for (const key of ["k:1", "k:2", "k:3"]) kept.record("/a", sample(key));
    expect(kept.calls("/a").map((found) => found.key)).toEqual(["k:3", "k:2"]);
  });

  it("keeps a large body in memory only", () => {
    const storage = memoryStorage();
    const inventory = createInventory({ storage, limits: { bodyLength: 10 } });
    inventory.record("/a", sample("k:big", "x".repeat(100)));
    expect(inventory.sample("k:big", "/a")).toBeDefined();
    expect(createInventory({ storage }).sample("k:big", "/a")).toBeUndefined();
  });

  it("keeps working when storage is full", () => {
    const inventory = createInventory({ storage: memoryStorage({ full: true }) });
    inventory.record("/a", sample("k:x"));
    expect(inventory.sample("k:x", "/a")).toBeDefined();
  });

  it.each([
    ["text that is not JSON", "{"],
    ["JSON that is not a list", '{"a":1}'],
    ["a route that is not a list", '[["/a", 3]]'],
  ])("starts empty from %s", (_, stored) => {
    const storage = memoryStorage();
    storage.map.set(INVENTORY_STORAGE_KEY, stored);
    expect(createInventory({ storage }).calls("/a")).toEqual([]);
  });

  it("skips a stored sample that is malformed", () => {
    const storage = memoryStorage();
    storage.map.set(INVENTORY_STORAGE_KEY, JSON.stringify([["/a", [{ key: 1 }, sample("k:ok")]]]));
    expect(
      createInventory({ storage })
        .calls("/a")
        .map((found) => found.key),
    ).toEqual(["k:ok"]);
  });
});

describe("an inventory's subscribers", () => {
  it("hears every record until it unsubscribes", () => {
    const inventory = createInventory();
    const heard: string[] = [];
    const stop = inventory.subscribe(() => heard.push(inventory.calls("/a")[0]?.key ?? ""));

    inventory.record("/a", sample("k:one"));
    inventory.record("/a", sample("k:two"));
    stop();
    inventory.record("/a", sample("k:three"));

    expect(heard).toEqual(["k:one", "k:two"]);
  });
});
