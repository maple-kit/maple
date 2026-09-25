/**
 * What the page has fetched, per route: the last real answer of every call.
 *
 * A box lists these calls, and a transform falls back to one when the server
 * fails. It lives in memory and in `sessionStorage`, so it survives the reload
 * that applies a mock. Only real 2xx answers are kept, never a mocked one.
 */

/** One call's last real answer. */
export interface Sample {
  readonly key: string;
  readonly status: number;
  readonly body: unknown;
  /** Milliseconds since the epoch. */
  readonly at: number;
}

/** The calls seen on each route. */
export interface Inventory {
  record(route: string, sample: Sample): void;
  /** The call's sample on `route`, or on any route when it was never seen there. */
  sample(key: string, route: string): Sample | undefined;
  /** Every call seen on `route`, most recent first. */
  calls(route: string): readonly Sample[];
}

/** Bounds that keep the stored inventory well inside a storage quota. */
export interface InventoryLimits {
  readonly routes: number;
  readonly callsPerRoute: number;
  /** A body longer than this, as JSON text, is kept in memory only. */
  readonly bodyLength: number;
}

/** Where an inventory keeps itself, and how much. */
export interface InventoryOptions {
  readonly storage?: Pick<Storage, "getItem" | "setItem">;
  readonly limits?: Partial<InventoryLimits>;
}

/** The `sessionStorage` key the inventory is kept under. */
export const INVENTORY_STORAGE_KEY = "maple-mock-inventory";

const LIMITS: InventoryLimits = { routes: 20, callsPerRoute: 50, bodyLength: 64 * 1024 };

type Routes = Map<string, Map<string, Sample>>;

/** An inventory, restored from `storage` when it holds one. */
export function createInventory(options: InventoryOptions = {}): Inventory {
  const limits = { ...LIMITS, ...options.limits };
  const routes: Routes = restore(options.storage);

  return {
    record(route, sample) {
      const calls = routes.get(route) ?? new Map<string, Sample>();
      routes.delete(route);
      routes.set(route, calls);
      calls.delete(sample.key);
      calls.set(sample.key, sample);
      trim(routes, limits);
      persist(routes, limits, options.storage);
    },
    sample(key, route) {
      const here = routes.get(route)?.get(key);
      if (here !== undefined) return here;
      const everywhere = [...routes.values()].map((calls) => calls.get(key));
      return everywhere.findLast((found) => found !== undefined);
    },
    calls(route) {
      return [...(routes.get(route)?.values() ?? [])].reverse();
    },
  };
}

/** Drops the oldest routes and calls past the limits. Maps keep insertion order. */
function trim(routes: Routes, limits: InventoryLimits): void {
  for (const calls of routes.values()) {
    for (const key of [...calls.keys()].slice(0, -limits.callsPerRoute)) calls.delete(key);
  }
  for (const route of [...routes.keys()].slice(0, -limits.routes)) routes.delete(route);
}

function persist(routes: Routes, limits: InventoryLimits, storage?: InventoryOptions["storage"]) {
  if (storage === undefined) return;
  const stored = [...routes].map(([route, calls]) => [
    route,
    [...calls.values()].filter((sample) => size(sample.body) <= limits.bodyLength),
  ]);
  try {
    storage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // A full or blocked storage leaves the in-memory inventory working.
  }
}

function size(body: unknown): number {
  return JSON.stringify(body)?.length ?? 0;
}

function restore(storage?: InventoryOptions["storage"]): Routes {
  const routes: Routes = new Map();
  try {
    const stored = JSON.parse(storage?.getItem(INVENTORY_STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(stored)) return routes;
    for (const [route, samples] of stored as [string, Sample[]][]) {
      routes.set(route, new Map(samples.filter(isSample).map((sample) => [sample.key, sample])));
    }
  } catch {
    // An unreadable inventory is an empty one; it refills as the page fetches.
  }
  return routes;
}

function isSample(value: unknown): value is Sample {
  if (typeof value !== "object" || value === null) return false;
  const { at, key, status } = value as Partial<Sample>;
  return typeof key === "string" && typeof status === "number" && typeof at === "number";
}
