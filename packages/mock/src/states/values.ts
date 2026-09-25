/**
 * What every body state asks of a value: whether it is an identifier, and how
 * a repeated item keeps its identifiers unique.
 */

import { enumOf, properties } from "../schema/json-schema.js";

import type { Located } from "../schema/json-schema.js";

/** Keys that identify an item, which no state rewrites. */
export const ID_KEYS = ["id", "_id", "uuid", "key", "slug"];

/** Keys holding the cursor of the next page, which only the server can read. */
export const CURSOR_KEYS = new Set([
  "next",
  "nextCursor",
  "next_cursor",
  "nextPage",
  "next_page",
  "nextPageToken",
  "next_page_token",
]);

const REFERENCE = /(?:Id|_id|Ids|_ids|ID)$/;

/** Whether `key` names an identifier, a reference to one or a cursor: `id`, `ownerId`. */
export function isIdKey(key: string): boolean {
  return ID_KEYS.includes(key) || CURSOR_KEYS.has(key) || REFERENCE.test(key);
}

/** Whether `value` is a plain object, which a state walks into. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `node` of the same document as `at`, or nothing when there is no schema. */
export function within(at: Located | undefined, node: Located["node"] | undefined) {
  return at === undefined || node === undefined ? undefined : { root: at.root, node };
}

/**
 * A copy of `item`, the `index`th of a longer list, with its identifiers made
 * unique among `items`, so list keys stay unique.
 */
export function uniqueCopy(
  item: Record<string, unknown>,
  index: number,
  items: readonly unknown[],
): Record<string, unknown> {
  const clone = structuredClone(item);
  for (const key of ID_KEYS) {
    const id = clone[key];
    if (typeof id === "string") clone[key] = `${id}-${String(index)}`;
    if (typeof id === "number") clone[key] = highest(items, key) + index;
  }
  return clone;
}

/** Each enumerated property of an item node and the values it may take. */
export function enumerated(at: Located): [string, unknown[]][] {
  return properties(at.root, at.node)
    .map(([key, schema]): [string, unknown[]] => [key, enumOf(at.root, schema)])
    .filter(([, values]) => values.length > 0);
}

function highest(items: readonly unknown[], key: string): number {
  const ids = items.map((item) => (isRecord(item) ? item[key] : undefined));
  return Math.max(0, ...ids.filter((id): id is number => typeof id === "number"));
}
