/**
 * What an endpoint reaching a model keeps between requests: a cache, so a
 * pause and a retype cost one call, and a limiter, so a stuck client cannot
 * spend a model budget. `/assist` and `/mock/plan` each build their own.
 */

import { fnv1a32 } from "../lib/fnv1a.js";

/** A fixed window, counted per session. */
export interface RateLimit {
  readonly limit: number;
  readonly windowMs: number;
}

/** Answers by what was asked, bounded to a size. */
export interface AnswerCache<T> {
  get(key: string): T | undefined;
  set(key: string, answer: T): void;
}

/** Counts a session's calls in its window. */
export interface Limiter {
  /** False once the session has spent its window. */
  take(session: string): boolean;
}

/**
 * Keyed by a hash so an entry costs one number, and holding the string it
 * hashed so a collision is a miss rather than another request's answer.
 */
export function createCache<T>(size: number): AnswerCache<T> {
  const entries = new Map<number, { readonly key: string; readonly answer: T }>();

  return {
    get(key) {
      const found = entries.get(fnv1a32(key));
      return found?.key === key ? found.answer : undefined;
    },
    set(key, answer) {
      entries.set(fnv1a32(key), { key, answer });
      evictOldest(entries, size);
    },
  };
}

/** A fixed window per session, so one stuck client cannot spend a budget. */
export function createLimiter(rate: RateLimit): Limiter {
  const windows = new Map<string, { count: number; until: number }>();

  return {
    take(session) {
      const now = Date.now();
      const open = windows.get(session);

      if (!open || open.until <= now) {
        windows.set(session, { count: 1, until: now + rate.windowMs });
        evictOldest(windows, rate.limit * 64);
        return true;
      }

      open.count += 1;
      return open.count <= rate.limit;
    },
  };
}

/** Insertion order is eviction order: neither map is worth an LRU's bookkeeping. */
function evictOldest(map: Map<unknown, unknown>, size: number): void {
  while (map.size > size) {
    const oldest = map.keys().next();
    if (oldest.done === true) return;
    map.delete(oldest.value);
  }
}

/** Every endpoint's answer: JSON, never cached by anything in between. */
export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
