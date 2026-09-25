/**
 * A value for a schema nothing has answered yet. Deterministic, so a mock of
 * a call never seen looks the same on every reload and in every screenshot:
 * the first enum value, the lower bound, one item, a fixed date.
 */

import { annotate } from "../superjson.js";
import { arrayOf, deref, enumOf, properties, typesOf, valueBranch } from "./json-schema.js";

import type { JsonSchema } from "./json-schema.js";

/** How a sample is written. */
export interface SampleOptions {
  /** Write `date-time` strings as superjson `Date`s, for {@link deflate}. */
  readonly superjson?: boolean;
}

/** How deep a sample nests before an object is left empty, which ends a cycle. */
const DEPTH = 8;

const DATE_TIME = "2026-01-01T00:00:00.000Z";

const FORMATS: Readonly<Record<string, string>> = {
  "date-time": DATE_TIME,
  date: "2026-01-01",
  time: "00:00:00Z",
  email: "reviewer@example.com",
  uri: "https://example.com/",
  url: "https://example.com/",
  uuid: "00000000-0000-4000-8000-000000000000",
  hostname: "example.com",
  ipv4: "192.0.2.1",
};

/** A value `schema` accepts, the same every time. */
export function sampleSchema(schema: JsonSchema, options: SampleOptions = {}): unknown {
  return sample(schema, schema, options, 0);
}

function sample(
  root: JsonSchema,
  node: JsonSchema,
  options: SampleOptions,
  depth: number,
): unknown {
  const here = deref(root, node);
  if ("const" in here) return here["const"];
  const listed = enumOf(root, node);
  if (listed.length > 0) return listed[0];
  const examples = here["examples"];
  const example: unknown = Array.isArray(examples) ? (examples as unknown[])[0] : here["default"];
  if (example !== undefined) return example;

  const branch = valueBranch(root, node);
  const type = typesOf(branch).find((one) => one !== "null");
  if (type === "object") return object(root, branch, options, depth);
  if (type === "array") return array(root, branch, options, depth);
  return scalar(type, branch, options);
}

function object(
  root: JsonSchema,
  node: JsonSchema,
  options: SampleOptions,
  depth: number,
): unknown {
  if (depth >= DEPTH) return {};
  return Object.fromEntries(
    properties(root, node).map(([key, schema]): [string, unknown] => [
      key,
      sample(root, schema, options, depth + 1),
    ]),
  );
}

function array(root: JsonSchema, node: JsonSchema, options: SampleOptions, depth: number): unknown {
  const { items, max, min } = arrayOf(root, node);
  if (depth >= DEPTH) return [];
  const length = Math.min(Math.max(min, 1), max);
  return Array.from({ length }, (): unknown => sample(root, items, options, depth + 1));
}

function scalar(
  type: string | undefined,
  node: { [keyword: string]: unknown },
  options: SampleOptions,
) {
  if (type === "string") return text(node, options);
  if (type === "integer" || type === "number") return number(node, type === "integer");
  if (type === "boolean") return false;
  return null;
}

function text(node: { [keyword: string]: unknown }, options: SampleOptions): unknown {
  const format = typeof node["format"] === "string" ? node["format"] : undefined;
  if (format === "date-time" && options.superjson === true) return annotate(["Date"], DATE_TIME);
  const value = (format === undefined ? undefined : FORMATS[format]) ?? "text";
  const min = typeof node["minLength"] === "number" ? node["minLength"] : 0;
  return value.length >= min ? value : value.padEnd(min, "x");
}

function number(node: { [keyword: string]: unknown }, integer: boolean): number {
  const { exclusiveMinimum, minimum } = node;
  if (typeof minimum === "number") return integer ? Math.ceil(minimum) : minimum;
  if (typeof exclusiveMinimum !== "number") return 0;
  return integer ? Math.floor(exclusiveMinimum) + 1 : exclusiveMinimum + 0.5;
}
