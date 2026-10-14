/**
 * The box's "Search all APIs": the tab's own calls first, since they carry a
 * real body, then the calls the route's documents describe. Nothing here runs
 * until a reviewer opens the search.
 */

import { CallsUnavailableError } from "../schema/calls.js";

import type { MockHandle } from "../interceptor.js";

/** How many results one page holds. */
export const SEARCH_PAGE = 20;

/** One call a search found. */
export interface CallHit {
  /** The key a recipe names it by. */
  readonly key: string;
  readonly summary?: string;
  /** True when this tab has fetched it, so a real body is on hand. */
  readonly seen: boolean;
}

/** One page of a search. */
export interface CallResults {
  readonly hits: readonly CallHit[];
  /** Hand it back to read the next page; absent on the last. */
  readonly next?: string;
  /** False when the route described no calls, so only the tab's were searched. */
  readonly schemas: boolean;
}

/**
 * A cursor is `i` and an offset into the tab's matches, or `s` and the
 * route's own cursor. The route's first page follows the tab's last.
 */
export async function searchCalls(
  handle: MockHandle,
  query: string,
  cursor?: string,
  signal?: AbortSignal,
): Promise<CallResults> {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const stock = handle.inventory
    .all()
    .filter(({ key }) => words.every((word) => key.toLowerCase().includes(word)))
    .map((sample): CallHit => ({ key: sample.key, seen: true }));
  const lookup: Lookup = { handle, query, stock, ...(signal === undefined ? {} : { signal }) };
  if (cursor?.[0] === "s") return fromRoute(lookup, cursor.slice(1) || undefined, []);
  const offset = Number(cursor?.slice(1)) || 0;
  const here = stock.slice(offset, offset + SEARCH_PAGE);
  if (stock.length > offset + SEARCH_PAGE) {
    return { hits: here, next: `i${String(offset + SEARCH_PAGE)}`, schemas: true };
  }
  return fromRoute(lookup, undefined, here);
}

/** What a search reads from: the page's handle, the tab's matches, and the way to cancel. */
interface Lookup {
  readonly handle: MockHandle;
  readonly query: string;
  readonly stock: readonly CallHit[];
  readonly signal?: AbortSignal;
}

async function fromRoute(
  lookup: Lookup,
  cursor: string | undefined,
  before: readonly CallHit[],
): Promise<CallResults> {
  const { handle, query, signal, stock } = lookup;
  if (handle.calls === undefined) return { hits: before, schemas: false };
  let page;
  try {
    page = await handle.calls(query, cursor, signal);
  } catch (error) {
    if (error instanceof CallsUnavailableError) return { hits: before, schemas: false };
    throw error;
  }
  const known = new Set(stock.map(({ key }) => key));
  const hits: CallHit[] = page.calls
    .map(({ key, summary }) => ({ key: recordedKey(key), summary }))
    .filter(({ key }) => !known.has(key))
    .map(({ key, summary }) => ({
      key,
      seen: false,
      ...(summary === undefined ? {} : { summary }),
    }));
  return {
    hits: [...before, ...hits],
    ...(page.next === undefined ? {} : { next: `s${page.next}` }),
    schemas: page.calls.length > 0 || cursor !== undefined || query !== "",
  };
}

/** An OpenAPI `{id}` is the `:id` a recorded call carries, which is what a recipe matches. */
function recordedKey(key: string): string {
  return key.replace(/\{[^{}]*\}/g, ":id");
}
