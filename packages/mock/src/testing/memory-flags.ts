/**
 * An in-memory flag provider, OpenFeature-shaped, for the contract suite and
 * for a test that needs flags without a vendor. `change` sets flags and emits
 * the configuration change a real provider would.
 */

import type {
  FlagEventDetails,
  FlagEvents,
  FlagProvider,
  Resolution,
} from "../openfeature/index.js";
import type { FlagValue } from "@maple-kit/core/mock";

/** A memory provider and the switch that changes its flags. */
export interface MemoryFlagProvider extends FlagProvider {
  readonly events: FlagEvents;
  change(flags: Readonly<Record<string, FlagValue>>): void;
}

/** How the provider answers: at once, as a web provider does, or in a promise, as a server's. */
export interface MemoryFlagOptions {
  readonly async?: boolean;
}

type Handler = (details?: FlagEventDetails) => unknown;

/** A provider holding `flags`. A flag it does not hold answers the default, with `FLAG_NOT_FOUND`. */
export function memoryFlagProvider(
  flags: Readonly<Record<string, FlagValue>>,
  options: MemoryFlagOptions = {},
): MemoryFlagProvider {
  const held = new Map(Object.entries(flags));
  const handlers = new Map<string, Set<Handler>>();
  const answer = <T>(key: string, fallback: T) => {
    const found: Resolution<T> = held.has(key)
      ? { value: held.get(key) as T, variant: "memory", reason: "STATIC" }
      : { value: fallback, reason: "ERROR", errorCode: "FLAG_NOT_FOUND" };
    return options.async === true ? Promise.resolve(found) : found;
  };
  return {
    metadata: { name: "memory" },
    events: {
      addHandler(eventType, handler) {
        const set = handlers.get(eventType) ?? new Set();
        set.add(handler);
        handlers.set(eventType, set);
      },
      removeHandler(eventType, handler) {
        handlers.get(eventType)?.delete(handler);
      },
    },
    resolveBooleanEvaluation: (key, fallback) => answer(key, fallback),
    resolveStringEvaluation: (key, fallback) => answer(key, fallback),
    resolveNumberEvaluation: (key, fallback) => answer(key, fallback),
    resolveObjectEvaluation: (key, fallback) => answer(key, fallback),
    change(next) {
      for (const [key, value] of Object.entries(next)) held.set(key, value);
      const details = { flagsChanged: Object.keys(next) };
      for (const handler of handlers.get("PROVIDER_CONFIGURATION_CHANGED") ?? []) handler(details);
    },
  };
}
