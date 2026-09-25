/**
 * `sparse`: everything that may be missing is missing. A schema says what
 * may be: a nullable field is `null` and an optional one is gone. Without
 * one, only what the recording proves is dropped, never a guess. Lists keep
 * their items.
 */

import { allowsNull, arrayOf, property } from "../schema/json-schema.js";
import { throughMarker } from "../superjson.js";
import { isRecord, within } from "./values.js";

import type { Located } from "../schema/json-schema.js";

/** How deep a body is walked, which ends a cycle a schema could not. */
const DEPTH = 16;

/** Left out of an object. */
const DROP = Symbol("drop");

/** `value` with every field that may be missing missing. */
export function thin(value: unknown, at?: Located, depth = 0): unknown {
  if (depth > DEPTH) return value;
  return throughMarker(value, (unmarked) => {
    if (Array.isArray(unmarked)) return items(unmarked, at, depth);
    if (!isRecord(unmarked)) return unmarked;
    return at === undefined ? recurse(unmarked, depth) : bySchema(unmarked, at, depth);
  });
}

function bySchema(value: Record<string, unknown>, at: Located, depth: number) {
  const entries = Object.entries(value).map(([key, field]): [string, unknown] => {
    const found = property(at.root, at.node, key);
    if (found === undefined) return [key, field];
    if (!found.required) return [key, DROP];
    if (allowsNull(at.root, found.schema)) return [key, null];
    return [key, thin(field, within(at, found.schema), depth + 1)];
  });
  return Object.fromEntries(entries.filter(([, field]) => field !== DROP));
}

function recurse(value: Record<string, unknown>, depth: number) {
  return Object.fromEntries(
    Object.entries(value).map(([key, field]) => [key, thin(field, undefined, depth + 1)]),
  );
}

/**
 * A list's items, thinned. Without a schema, a key one item lacks is dropped
 * from every item, and a key one item holds `null` is `null` in every item.
 */
function items(list: readonly unknown[], at: Located | undefined, depth: number): unknown[] {
  const inner = within(at, at === undefined ? undefined : arrayOf(at.root, at.node).items);
  const shown = inner === undefined ? proven(list) : list;
  return shown.map((item) => thin(item, inner, depth + 1));
}

function proven(list: readonly unknown[]): unknown[] {
  const records = list.filter(isRecord);
  if (records.length < 2) return [...list];
  const keys = new Set(records.flatMap((record) => Object.keys(record)));
  const absent = [...keys].filter((key) => records.some((record) => !(key in record)));
  const nulled = [...keys].filter((key) => records.some((record) => record[key] === null));
  return list.map((item) => {
    if (!isRecord(item)) return item;
    const next = { ...item };
    for (const key of absent) delete next[key];
    for (const key of nulled) if (key in next) next[key] = null;
    return next;
  });
}
