/**
 * Reshaping a JSON body into a state. Code, not a model: every value in the
 * output was in the input, so the app's own parser still accepts it.
 *
 * Only lists and the envelope keys beside them change. Given the call's
 * schema, a key is nulled only where it is nullable and dropped only where it
 * is optional, and a list keeps the length the schema requires.
 */

import { allowsNull, arrayOf, enumOf, properties, property } from "./schema/json-schema.js";
import { deflate, inflate, throughMarker } from "./superjson.js";

import type { JsonSchema, Located } from "./schema/json-schema.js";
import type { TypeMeta } from "./superjson.js";

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
export function reshape(state: BodyState, body: unknown, schema?: JsonSchema): unknown {
  const at = schema === undefined ? undefined : { root: schema, node: schema };
  if (typeof body === "number") return count(state, body);
  return walk(state, body, 0, at);
}

/**
 * `body` reshaped with its superjson annotations kept true: a dropped item
 * drops its `Date`, a repeated one repeats it. Identities are not kept.
 */
export function reshapeTyped(
  state: BodyState,
  body: unknown,
  meta: TypeMeta,
  schema?: JsonSchema,
): { body: unknown; meta: TypeMeta } {
  if (meta.values === undefined) return { body: reshape(state, body, schema), meta: {} };
  return deflate(reshape(state, inflate(body, meta), schema), meta.v);
}

/** Left out of an object: an optional key a schema forbids nulling. */
const DROP = Symbol("drop");

function walk(state: BodyState, value: unknown, depth: number, at?: Located): unknown {
  return throughMarker(value, (unmarked) => walkUnmarked(state, unmarked, depth, at));
}

function walkUnmarked(state: BodyState, value: unknown, depth: number, at?: Located): unknown {
  if (Array.isArray(value)) return list(state, value, at);
  if (!isRecord(value) || depth >= DEPTH) return value;
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, field]) => [key, entry(state, [key, field], depth, at)] as const)
      .filter(([, field]) => field !== DROP),
  );
}

function entry(state: BodyState, [key, field]: [string, unknown], depth: number, at?: Located) {
  const found = at === undefined ? undefined : property(at.root, at.node, key);
  const inner =
    found === undefined || at === undefined ? undefined : { root: at.root, node: found.schema };
  if (typeof field === "number" && COUNT_KEYS.has(key)) return count(state, field);
  if (state === "many") return walk(state, field, depth + 1, inner);
  if (typeof field === "string" && CURSOR_KEYS.has(key)) return cursor(field, found, at);
  if (typeof field === "boolean" && MORE_KEYS.has(key)) return false;
  return walk(state, field, depth + 1, inner);
}

/**
 * No next page, in the only form the schema allows: `null` where it is
 * nullable, gone where it is optional, and otherwise left as it was.
 */
function cursor(
  field: string,
  found: { readonly schema: JsonSchema; readonly required: boolean } | undefined,
  at: Located | undefined,
): unknown {
  if (found === undefined || at === undefined) return null;
  if (allowsNull(at.root, found.schema)) return null;
  return found.required ? field : DROP;
}

function count(state: BodyState, value: number): number {
  if (state === "empty") return 0;
  return state === "one" ? Math.min(value, 1) : Math.max(value, MANY);
}

function list(state: BodyState, items: readonly unknown[], at?: Located): unknown[] {
  const bounds = at === undefined ? undefined : arrayOf(at.root, at.node);
  const min = bounds?.min ?? 0;
  if (state === "empty") return items.slice(0, min);
  if (state === "one") return items.slice(0, Math.max(1, min));
  const target = Math.min(MANY, bounds?.max ?? MANY);
  if (items.length === 0 || items.length >= target) return items.slice(0, bounds?.max);
  const itemAt =
    bounds === undefined || at === undefined ? undefined : { root: at.root, node: bounds.items };
  return Array.from({ length: target }, (_, index) => {
    const item = items[index % items.length];
    return index < items.length ? item : copy(item, index, items, itemAt);
  });
}

/**
 * A repeated item with its identifiers made unique, so list keys stay unique,
 * and each enumerated field on the next of its values, so `many` shows them all.
 */
function copy(item: unknown, index: number, items: readonly unknown[], at?: Located): unknown {
  if (!isRecord(item)) return item;
  const clone = structuredClone(item);
  for (const key of ID_KEYS) {
    const id = clone[key];
    if (typeof id === "string") clone[key] = `${id}-${index}`;
    if (typeof id === "number") clone[key] = highest(items, key) + index;
  }
  if (at === undefined) return clone;
  for (const [key, schema] of properties(at.root, at.node)) {
    const values = enumOf(at.root, schema);
    if (values.length > 0 && key in clone) clone[key] = values[index % values.length];
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
