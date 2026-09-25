/**
 * Following a local `$ref` through a JSON Schema: what a planner's summary
 * and the identity rules both read a call's shape with. A ref outside the
 * schema is not followed.
 */

import type { JsonSchema } from "./shape.js";

/** A schema object, read-only. */
export type SchemaNode = Readonly<Record<string, unknown>>;

const REF_HOPS = 8;

/** The node a chain of local `$ref`s ends at, and the component it last named. */
export function resolved(root: JsonSchema, node: unknown): { here?: SchemaNode; name?: string } {
  let current: unknown = node;
  let name: string | undefined;
  for (let hop = 0; hop < REF_HOPS; hop += 1) {
    if (!isNode(current)) return {};
    const ref = current["$ref"];
    if (typeof ref !== "string") return { here: current, ...(name === undefined ? {} : { name }) };
    name = decode(ref.split("/").at(-1) ?? "");
    current = pointer(root, ref);
  }
  return {};
}

/** A `#/…` pointer into the schema itself. */
function pointer(root: JsonSchema, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  let at: unknown = root;
  for (const segment of ref.slice(2).split("/")) {
    if (!isNode(at)) return undefined;
    at = at[decode(segment)];
  }
  return at;
}

function decode(segment: string): string {
  return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}

/** Whether `value` is a schema object rather than `true`, `false` or a list. */
export function isNode(value: unknown): value is SchemaNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
