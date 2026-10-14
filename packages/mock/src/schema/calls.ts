/**
 * The calls Maple's route describes, `GET {base}/mock/calls`, a page at a
 * time. Nothing asks until a reviewer opens the search; a route with no
 * documents answers an empty list, a build that is not a preview answers 404.
 */

import type { CallEntry } from "@maple-kit/core/mock";

/** One page of the route's calls. */
export interface CallsPage {
  readonly calls: readonly CallEntry[];
  /** Hand it back to read the next page; absent on the last. */
  readonly next?: string;
}

/** Asks the route for the calls matching `query`, from `cursor`. */
export type CallsLookup = (
  query: string,
  cursor?: string,
  signal?: AbortSignal,
) => Promise<CallsPage>;

/** The longest search the route accepts; it answers 400 past this, so nothing longer is sent. */
export const CALLS_QUERY_MAX = 200;

/** Raised when the route answers 404: no preview, so nothing to search. */
export class CallsUnavailableError extends Error {
  override readonly name = "CallsUnavailableError";
}

/** Raised when the route answers badly or cannot be reached. */
export class CallsFailedError extends Error {
  override readonly name = "CallsFailedError";
}

/** Where the route is, and how to reach it past the interceptor. */
export interface RouteCallsOptions {
  /** Where Maple's route is mounted, such as `/api/maple`. */
  readonly basePath: string;
  /** The real `fetch`, so the request is not itself intercepted. */
  readonly fetch: typeof fetch;
  /** Defaults to the page's own origin. */
  readonly origin?: string;
}

/**
 * A lookup over the route's calls.
 *
 * @throws {CallsUnavailableError} when the route answers 404.
 * @throws {CallsFailedError} when the route fails or cannot be reached.
 */
export function routeCalls(options: RouteCallsOptions): CallsLookup {
  const base = options.basePath.replace(/\/$/, "");
  const where =
    options.origin ?? (typeof location === "undefined" ? "http://localhost" : location.origin);

  return async (query, cursor, signal) => {
    const url = new URL(`${base}/mock/calls`, where);
    url.searchParams.set("q", query.slice(0, CALLS_QUERY_MAX));
    if (cursor !== undefined) url.searchParams.set("cursor", cursor);
    let response: Response;
    try {
      response = await options.fetch(url, {
        credentials: "same-origin",
        ...(signal === undefined ? {} : { signal }),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new CallsFailedError("The route could not be reached.", { cause: error });
    }
    if (response.status === 404) throw new CallsUnavailableError("This route lists no calls.");
    if (!response.ok) throw new CallsFailedError(`The route could not search: ${response.status}`);
    return pageOf(await response.json().catch(() => undefined));
  };
}

function pageOf(body: unknown): CallsPage {
  const { calls, next } = (typeof body === "object" && body !== null ? body : {}) as {
    calls?: unknown;
    next?: unknown;
  };
  const kept = (Array.isArray(calls) ? calls : []).filter(isEntry);
  return { calls: kept, ...(typeof next === "string" ? { next } : {}) };
}

function isEntry(value: unknown): value is CallEntry {
  if (typeof value !== "object" || value === null) return false;
  const { key, method, path } = value as Partial<CallEntry>;
  return typeof key === "string" && typeof method === "string" && typeof path === "string";
}
