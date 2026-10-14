/**
 * The request-scoped collector behind `recordFlagUse`. State sits on
 * `globalThis`, because a framework may load this module once per bundle and
 * the route that switches collection on is not the code that reads flags.
 */

import { AsyncLocalStorage } from "node:async_hooks";

const KEY = Symbol.for("@maple-kit/core.flag-use");

/** The most distinct keys one request keeps. */
const MOST_KEYS = 500;

interface FlagUseState {
  readonly storage: AsyncLocalStorage<Set<string>>;
  enabled: boolean;
}

function state(): FlagUseState {
  const global = globalThis as { [KEY]?: FlagUseState };
  global[KEY] ??= { storage: new AsyncLocalStorage<Set<string>>(), enabled: false };
  return global[KEY];
}

/** Called by the Maple route when its preview switch is on. */
export function allowFlagUse(): void {
  state().enabled = true;
}

/** Runs `work` with a collector, or without one when collection is off. */
export function collectFlagUse<T>(work: () => T): {
  readonly result: T;
  readonly keys: Set<string>;
} {
  const { enabled, storage } = state();
  const keys = new Set<string>();
  return { result: enabled ? storage.run(keys, work) : work(), keys };
}

/** Adds a key to the current request's collector, if there is one. */
export function noteFlagUse(key: string): void {
  const keys = state().storage.getStore();
  if (keys === undefined || keys.size >= MOST_KEYS) return;
  keys.add(key);
}
