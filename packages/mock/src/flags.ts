/**
 * The flags a page evaluated, whatever evaluated them: an OpenFeature provider
 * wrapped by `withMockFlags`, or a vendor's flag answer read off the wire. The
 * box lists them as toggles, so it finds them here rather than importing the
 * adapter, as it finds the interceptor's handle.
 */

import type { FlagValue } from "@maple-kit/core/mock";

/** One flag, as last evaluated for real. */
export interface SeenFlag {
  readonly key: string;
  /** What its evaluation asked for. */
  readonly type: "boolean" | "number" | "object" | "string";
  /** Its real value, never the mocked one. */
  readonly value: FlagValue;
  /** The values it can take, when its source says. */
  readonly variants?: readonly FlagValue[];
}

/** A flag some code read while rendering a route, as opposed to one merely offered. */
export interface UsedFlag extends SeenFlag {
  /** The route pattern the page was on when it read the flag. */
  readonly route: string;
  /** Where it was read. Defaults to the browser. */
  readonly source?: "browser" | "server";
}

/**
 * Every flag the page was offered (known) and every flag a route read (used).
 * Used flags are what the box lists; known ones are the fallback and the
 * pool a search draws on.
 */
export interface FlagRegistry {
  /** Records a flag as known. */
  record(flag: SeenFlag): void;
  /** Records a flag as read on a route. */
  recordUsed(flag: UsedFlag): void;
  /** Every known flag, most recent last. */
  known(): readonly SeenFlag[];
  /** The flags read on `route`, most recent last, with their real values where known. */
  used(route: string): readonly SeenFlag[];
  /** Whether anything was ever recorded as used, on any route. */
  hasUsed(): boolean;
  /** Called after a flag is recorded for the first time or changes. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

const KEY = Symbol.for("@maple-kit/mock.flags");

/** The most flags kept: a server that evaluates per request must not grow without bound. */
const MOST = 200;

/** The most used entries kept: each is a flag on a route. */
const MOST_USED = 1000;

/** The page's one registry, made on first use. */
export function seenFlags(): FlagRegistry {
  const global = globalThis as { [KEY]?: FlagRegistry };
  global[KEY] ??= createFlagRegistry();
  return global[KEY];
}

function createFlagRegistry(): FlagRegistry {
  const flags = new Map<string, SeenFlag>();
  const used = new Map<string, UsedFlag>();
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  return {
    recordUsed(flag) {
      const id = JSON.stringify([flag.source ?? "browser", flag.route, flag.key]);
      const before = used.get(id);
      if (before !== undefined && JSON.stringify(before) === JSON.stringify(flag)) return;
      used.delete(id);
      used.set(id, flag);
      for (const id of [...used.keys()].slice(0, -MOST_USED)) used.delete(id);
      notify();
    },
    used(route) {
      const found = new Map<string, SeenFlag>();
      for (const flag of used.values()) {
        if (flag.route !== route) continue;
        const { key, type, value } = flag;
        found.delete(key);
        found.set(key, { key, type, value, ...flags.get(key) });
      }
      return [...found.values()];
    },
    hasUsed: () => used.size > 0,
    record(flag) {
      const known = flags.get(flag.key);
      if (known !== undefined && JSON.stringify(known) === JSON.stringify(flag)) return;
      flags.delete(flag.key);
      flags.set(flag.key, flag);
      for (const key of [...flags.keys()].slice(0, -MOST)) flags.delete(key);
      notify();
    },
    known: () => [...flags.values()],
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
