/**
 * What the route tells a planner about a call: the names the page sent, and
 * the call's schema in one line. Names only, never a value; a local `$ref` is
 * followed, and the component it names is named.
 */

import { isNode as isRecord, resolved } from "../mock/pointer.js";

import type { JsonSchema } from "../mock/shape.js";

/** How deep a summary reads into a schema, how wide, and how long it may grow. */
const DEPTH = 2;
const FIELDS = 12;
const MAX_SAID = 400;

/**
 * The page's words and the schema's, once each: where one's words are all in
 * the other, only the other is kept.
 */
export function summarise(page: string, schema: JsonSchema | undefined): string {
  const said = schema === undefined ? "" : describe(schema, schema, 0);
  if (covers(page, said)) return page;
  if (covers(said, page)) return said;
  return `${page} — ${said}`;
}

/** True when every word of `inner` is already a word of `outer`. */
function covers(outer: string, inner: string): boolean {
  const words = new Set(outer.match(/\w+/g));
  return (inner.match(/\w+/g) ?? []).every((word) => words.has(word));
}

/** A schema in a line: its name or title, description, fields, a list's item. */
function describe(root: JsonSchema, node: JsonSchema, depth: number): string {
  const { here, name } = resolved(root, node);
  if (here === undefined || depth > DEPTH) return "";
  const parts = [here["title"] ?? name, here["description"]].filter(
    (part): part is string => typeof part === "string" && part !== "",
  );

  const items = here["items"];
  if (items !== undefined && typeof items !== "boolean") {
    parts.push(`list of [${describe(root, items as JsonSchema, depth + 1)}]`);
  }

  const properties = here["properties"];
  if (isRecord(properties)) {
    const fields = Object.entries(properties)
      .slice(0, FIELDS)
      .map(([key, value]) => field(root, key, value as JsonSchema, depth));
    if (fields.length > 0) parts.push(fields.join(", "));
  }

  return parts.join(": ").slice(0, MAX_SAID);
}

/** A field's name, and what a list-valued one holds. */
function field(root: JsonSchema, key: string, schema: JsonSchema, depth: number): string {
  const items = resolved(root, schema).here?.["items"];
  if (items === undefined || typeof items === "boolean") return key;
  const inner = describe(root, items as JsonSchema, depth + 1);
  return inner === "" ? key : `${key} [${inner}]`;
}
