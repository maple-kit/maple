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

/** Every flag the page evaluated, most recent last. */
export interface FlagRegistry {
  record(flag: SeenFlag): void;
  list(): readonly SeenFlag[];
  /** Called after a flag is recorded for the first time or changes. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

const KEY = Symbol.for("@maple-kit/mock.flags");

/** The most flags kept: a server that evaluates per request must not grow without bound. */
const MOST = 200;

/** The page's one registry, made on first use. */
export function seenFlags(): FlagRegistry {
  const global = globalThis as { [KEY]?: FlagRegistry };
  global[KEY] ??= createFlagRegistry();
  return global[KEY];
}

function createFlagRegistry(): FlagRegistry {
  const flags = new Map<string, SeenFlag>();
  const listeners = new Set<() => void>();
  return {
    record(flag) {
      const known = flags.get(flag.key);
      if (known !== undefined && JSON.stringify(known) === JSON.stringify(flag)) return;
      flags.delete(flag.key);
      flags.set(flag.key, flag);
      for (const key of [...flags.keys()].slice(0, -MOST)) flags.delete(key);
      for (const listener of [...listeners]) listener();
    },
    list: () => [...flags.values()],
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
