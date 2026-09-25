/**
 * `mixed`: a list that covers every combination that matters, rather than
 * more items. Each field rotates through what it may be: every enum value,
 * both booleans, null and set, absent and present, short and long text. The
 * rotations run side by side, a covering set rather than a cross product.
 */

import {
  allowsNull,
  enumOf,
  properties,
  requiredOf,
  typesOf,
  valueBranch,
} from "../schema/json-schema.js";
import { sampleNode } from "../schema/sample.js";
import { longText } from "./long.js";
import { isIdKey, isRecord, uniqueCopy } from "./values.js";

import type { Located } from "../schema/json-schema.js";

/** How a list is covered. */
export interface Cover {
  /** The list's item schema, when the call has one. */
  readonly at?: Located;
  /** The most items the list may hold, from its schema. */
  readonly max: number;
  /** The most items a list is grown to. */
  readonly grow: number;
  /** The body is superjson's, so a sampled date is a `Date`. */
  readonly typed: boolean;
}

const KEPT = Symbol("kept");
const ABSENT = Symbol("absent");
const LONG = Symbol("long");

/** One of the things a field is made in an item: a value, or one of the three above. */
type Option = typeof ABSENT | typeof KEPT | typeof LONG | { readonly value: unknown };

interface Dimension {
  readonly key: string;
  readonly options: readonly Option[];
  readonly at?: Located;
}

/** `items` grown only as far as covering every option of every field needs. */
export function cover(items: readonly unknown[], how: Cover): unknown[] {
  const records = items.filter(isRecord);
  if (records.length === 0 || records.length !== items.length) return items.slice(0, how.max);
  const dimensions = how.at === undefined ? observed(records) : declared(records, how.at);
  const needed = Math.max(0, ...dimensions.map((dimension) => dimension.options.length));
  const length = Math.min(how.max, Math.max(records.length, Math.min(how.grow, needed)));
  return Array.from({ length }, (_, index) => {
    const source = records[index % records.length] ?? {};
    const item =
      index < records.length ? structuredClone(source) : uniqueCopy(source, index, records);
    for (const dimension of dimensions) set(item, dimension, index, { records, typed: how.typed });
    return item;
  });
}

/** What a field may be, from the item schema. */
function declared(records: readonly Record<string, unknown>[], at: Located): Dimension[] {
  const required = requiredOf(at.root, at.node);
  return properties(at.root, at.node).flatMap(([key, schema]): Dimension[] => {
    if (isIdKey(key)) return [];
    const field = { root: at.root, node: schema };
    const listed = enumOf(at.root, schema);
    const options: Option[] = listed.length > 0 ? listed.map(valueOf) : base(field);
    if (lengthens(records, key, field)) options.push(LONG);
    if (allowsNull(at.root, schema)) options.push({ value: null });
    if (!required.includes(key)) options.push(ABSENT);
    return options.length > 1 ? [{ key, options, at: field }] : [];
  });
}

/** What a field is seen to be, from the recorded items alone. */
function observed(records: readonly Record<string, unknown>[]): Dimension[] {
  const keys = new Set(records.flatMap((record) => Object.keys(record)));
  return [...keys].flatMap((key): Dimension[] => {
    if (isIdKey(key)) return [];
    const values = records.filter((record) => key in record).map((record) => record[key]);
    const options: Option[] = values.some((value) => typeof value === "boolean")
      ? [{ value: true }, { value: false }]
      : [KEPT];
    if (lengthens(records, key)) options.push(LONG);
    if (values.includes(null) && values.some((value) => value !== null)) {
      options.push({ value: null });
    }
    if (values.length > 0 && values.length < records.length) options.push(ABSENT);
    return options.length > 1 ? [{ key, options }] : [];
  });
}

function base(field: Located): Option[] {
  const types = typesOf(valueBranch(field.root, field.node));
  return types.includes("boolean") ? [{ value: true }, { value: false }] : [KEPT];
}

function valueOf(value: unknown): Option {
  return { value };
}

function lengthens(records: readonly Record<string, unknown>[], key: string, at?: Located) {
  return records.some((record) => {
    const value = record[key];
    return typeof value === "string" && longText(value, at) !== value;
  });
}

interface Context {
  readonly records: readonly Record<string, unknown>[];
  readonly typed: boolean;
}

function set(item: Record<string, unknown>, dimension: Dimension, index: number, context: Context) {
  const { key, options } = dimension;
  const option = options[index % options.length];
  if (option === ABSENT) {
    delete item[key];
    return;
  }
  if (option === undefined || typeof option === "symbol") {
    const present = item[key] ?? borrowed(key, context.records) ?? sampled(dimension, context);
    if (present === undefined) return;
    item[key] =
      option === LONG && typeof present === "string" ? longText(present, dimension.at) : present;
    return;
  }
  item[key] = structuredClone(option.value);
}

/** The first real value another item holds for `key`. */
function borrowed(key: string, records: readonly Record<string, unknown>[]): unknown {
  const found = records.find((record) => record[key] !== undefined && record[key] !== null);
  return found === undefined ? undefined : structuredClone(found[key]);
}

function sampled(dimension: Dimension, context: Context): unknown {
  const at = dimension.at;
  if (at === undefined) return undefined;
  const value = sampleNode(at.root, valueBranch(at.root, at.node), {
    superjson: context.typed,
  });
  return value ?? undefined;
}
