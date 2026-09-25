/**
 * Reshaping a JSON body into a state. Code, not a model: every value in the
 * output was in the input, so the app's own parser still accepts it.
 *
 * Only lists and the envelope keys beside them change. A field outside that
 * is left alone, because without a schema nothing says it may be null.
 */

/** The states a body can be reshaped into. */
export type BodyState = "empty" | "many" | "one";

/** How many items `many` makes of a list. */
export const MANY = 50;

/** How deep into nested objects a list is looked for: `{ data: { items } }`. */
const DEPTH = 3;

const COUNT_KEYS = new Set([
  "count",
  "total",
  "totalCount",
  "total_count",
  "totalItems",
  "total_items",
  "totalResults",
  "total_results",
]);
const CURSOR_KEYS = new Set([
  "next",
  "nextCursor",
  "next_cursor",
  "nextPage",
  "next_page",
  "nextPageToken",
  "next_page_token",
]);
const MORE_KEYS = new Set(["hasMore", "has_more", "hasNext", "has_next", "hasNextPage"]);
const ID_KEYS = ["id", "_id", "uuid", "key", "slug"];

/** `body` reshaped into `state`. The input is never modified. */
export function reshape(state: BodyState, body: unknown): unknown {
  if (typeof body === "number") return count(state, body);
  return walk(state, body, 0);
}

function walk(state: BodyState, value: unknown, depth: number): unknown {
  if (Array.isArray(value)) return list(state, value);
  if (!isRecord(value) || depth >= DEPTH) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, field]) => [key, entry(state, key, field, depth)]),
  );
}

function entry(state: BodyState, key: string, field: unknown, depth: number): unknown {
  if (typeof field === "number" && COUNT_KEYS.has(key)) return count(state, field);
  if (state === "many") return walk(state, field, depth + 1);
  if (typeof field === "string" && CURSOR_KEYS.has(key)) return null;
  if (typeof field === "boolean" && MORE_KEYS.has(key)) return false;
  return walk(state, field, depth + 1);
}

function count(state: BodyState, value: number): number {
  if (state === "empty") return 0;
  return state === "one" ? Math.min(value, 1) : Math.max(value, MANY);
}

function list(state: BodyState, items: readonly unknown[]): unknown[] {
  if (state === "empty") return [];
  if (state === "one") return items.slice(0, 1);
  if (items.length === 0 || items.length >= MANY) return [...items];
  return Array.from({ length: MANY }, (_, index) => {
    const item = items[index % items.length];
    return index < items.length ? item : copy(item, index, items);
  });
}

/** A repeated item with its identifiers made unique, so list keys stay unique. */
function copy(item: unknown, index: number, items: readonly unknown[]): unknown {
  if (!isRecord(item)) return item;
  const clone = structuredClone(item);
  for (const key of ID_KEYS) {
    const id = clone[key];
    if (typeof id === "string") clone[key] = `${id}-${index}`;
    if (typeof id === "number") clone[key] = highest(items, key) + index;
  }
  return clone;
}

function highest(items: readonly unknown[], key: string): number {
  const ids = items.map((item) => (isRecord(item) ? item[key] : undefined));
  return Math.max(0, ...ids.filter((id): id is number => typeof id === "number"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
