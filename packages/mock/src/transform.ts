/**
 * Reshaping a JSON body into a state. Code, not a model: every value in the
 * output is derived from the input, never invented, so the app's own parser
 * still accepts it. `long` makes a text longer from its own characters.
 *
 * Given the call's schema, a key is nulled only where it is nullable and
 * dropped only where it is optional, a list keeps the length the schema
 * requires, and a text never passes its `maxLength`.
 */

import { allowsNull, arrayOf, property } from "./schema/json-schema.js";
import { lengthen } from "./states/long.js";
import { cover } from "./states/mixed.js";
import { thin } from "./states/sparse.js";
import { CURSOR_KEYS, enumerated, isRecord, uniqueCopy } from "./states/values.js";
import { deflate, inflate, throughMarker } from "./superjson.js";

import type { Located } from "./schema/json-schema.js";
import type { TypeMeta } from "./superjson.js";
import type { JsonSchema } from "@maple-kit/core/mock";

/** The states a body can be reshaped into. */
export type BodyState = "empty" | "long" | "many" | "mixed" | "one" | "sparse";

/** How a body is reshaped, beside its state. */
interface Reshaping {
  /** The body is superjson's, so a value sampled for it is typed. */
  readonly typed: boolean;
}

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
const MORE_KEYS = new Set(["hasMore", "has_more", "hasNext", "has_next", "hasNextPage"]);
/** `body` reshaped into `state`. The input is never modified. */
export function reshape(state: BodyState, body: unknown, schema?: JsonSchema): unknown {
  return reshapeAs(state, body, schema, { typed: false });
}

function reshapeAs(
  state: BodyState,
  body: unknown,
  schema: JsonSchema | undefined,
  how: Reshaping,
) {
  const at = schema === undefined ? undefined : { root: schema, node: schema };
  if (state === "long") return lengthen(body, at);
  if (state === "sparse") return thin(body, at);
  if (typeof body === "number") return count(state, body);
  return walk(state, body, 0, { at, how });
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
  return deflate(reshapeAs(state, inflate(body, meta), schema, { typed: true }), meta.v);
}

/** Left out of an object: an optional key a schema forbids nulling. */
const DROP = Symbol("drop");

/** Where a walk is: the schema node it is at, if any, and how it reshapes. */
interface Place {
  readonly at: Located | undefined;
  readonly how: Reshaping;
}

function walk(state: BodyState, value: unknown, depth: number, place: Place): unknown {
  return throughMarker(value, (unmarked) => walkUnmarked(state, unmarked, depth, place));
}

function walkUnmarked(state: BodyState, value: unknown, depth: number, place: Place): unknown {
  if (Array.isArray(value)) return list(state, value, place);
  if (!isRecord(value) || depth >= DEPTH) return value;
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, field]) => [key, entry(state, [key, field], depth, place)] as const)
      .filter(([, field]) => field !== DROP),
  );
}

function entry(state: BodyState, [key, field]: [string, unknown], depth: number, place: Place) {
  const { at } = place;
  const found = at === undefined ? undefined : property(at.root, at.node, key);
  const inner = {
    at: found === undefined || at === undefined ? undefined : { root: at.root, node: found.schema },
    how: place.how,
  };
  if (typeof field === "number" && COUNT_KEYS.has(key)) return count(state, field);
  if (state === "many" || state === "mixed") return walk(state, field, depth + 1, inner);
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

/** A count as the state says it. `mixed` is about kinds, not count, so it keeps it. */
function count(state: BodyState, value: number): number {
  if (state === "empty") return 0;
  if (state === "one") return Math.min(value, 1);
  return state === "many" ? Math.max(value, MANY) : value;
}

function list(state: BodyState, items: readonly unknown[], place: Place): unknown[] {
  const { at } = place;
  const bounds = at === undefined ? undefined : arrayOf(at.root, at.node);
  const min = bounds?.min ?? 0;
  const itemAt =
    bounds === undefined || at === undefined ? undefined : { root: at.root, node: bounds.items };
  if (state === "empty") return items.slice(0, min);
  if (state === "one") return items.slice(0, Math.max(1, min));
  const max = bounds?.max ?? Number.POSITIVE_INFINITY;
  if (state === "mixed") {
    return cover(items, {
      max,
      grow: MANY,
      typed: place.how.typed,
      ...(itemAt ? { at: itemAt } : {}),
    });
  }
  const target = Math.min(MANY, max);
  if (items.length === 0 || items.length >= target) return items.slice(0, bounds?.max);
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
  const clone = uniqueCopy(item, index, items);
  if (at === undefined) return clone;
  for (const [key, values] of enumerated(at)) {
    if (key in clone) clone[key] = values[index % values.length];
  }
  return clone;
}
