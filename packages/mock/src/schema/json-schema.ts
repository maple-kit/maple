/**
 * Reading one call's JSON Schema: the few questions a transform and the
 * sampler ask of it. Structural and forgiving, so OpenAPI 3.0's `nullable`,
 * 3.1's type lists and a `$ref` into `$defs` or `components` all read the same.
 */

import type { JsonSchema } from "@maple-kit/core/mock";

type Node = { readonly [keyword: string]: unknown };

/** A node and the document its `$ref`s point into. */
export interface Located {
  readonly root: JsonSchema;
  readonly node: JsonSchema;
}

/** How deep a chain of `$ref`s is followed before it is taken as a cycle. */
const REF_LIMIT = 32;

/** `node` with its `$ref` followed, or an empty schema when the ref does not resolve. */
export function deref(root: JsonSchema, node: JsonSchema): Node {
  let current: JsonSchema = node;
  for (let hops = 0; hops < REF_LIMIT; hops += 1) {
    if (typeof current === "boolean") return {};
    const ref = current["$ref"];
    if (typeof ref !== "string") return current;
    current = pointer(root, ref) ?? {};
  }
  return {};
}

/** The alternatives `node` allows: its `anyOf` or `oneOf`, flattened, or itself. */
export function branches(root: JsonSchema, node: JsonSchema): Node[] {
  const here = deref(root, node);
  const choices = [here["anyOf"], here["oneOf"]].find(Array.isArray) as JsonSchema[] | undefined;
  if (choices === undefined) return [here];
  return choices.flatMap((choice) => branches(root, choice));
}

/** Whether `null` is a value `node` accepts. */
export function allowsNull(root: JsonSchema, node: JsonSchema): boolean {
  if (node === true) return true;
  return branches(root, node).some(
    (branch) =>
      branch["nullable"] === true ||
      typesOf(branch).includes("null") ||
      branch["const"] === null ||
      (Array.isArray(branch["enum"]) && branch["enum"].includes(null)),
  );
}

/** The first alternative that is not only `null`, which is what a value is shaped by. */
export function valueBranch(root: JsonSchema, node: JsonSchema): Node {
  const all = branches(root, node);
  return all.find((branch) => !isOnlyNull(branch)) ?? all[0] ?? {};
}

/** The types a node names, or infers from its keywords. */
export function typesOf(node: Node): string[] {
  const type = node["type"];
  if (typeof type === "string") return [type];
  if (Array.isArray(type)) return type.filter((one): one is string => typeof one === "string");
  if ("properties" in node || "additionalProperties" in node) return ["object"];
  if ("items" in node) return ["array"];
  return [];
}

/** The schema of `key` on an object node, and whether the object requires it. */
export function property(
  root: JsonSchema,
  node: JsonSchema,
  key: string,
): { readonly schema: JsonSchema; readonly required: boolean } | undefined {
  for (const part of parts(root, valueBranch(root, node))) {
    const properties = part["properties"] as Record<string, JsonSchema> | undefined;
    const schema = properties?.[key];
    if (schema === undefined) continue;
    return { schema, required: requiredOf(root, node).includes(key) };
  }
  return undefined;
}

/** Every property an object node declares, in order, merged across `allOf`. */
export function properties(root: JsonSchema, node: JsonSchema): [string, JsonSchema][] {
  const seen = new Map<string, JsonSchema>();
  for (const part of parts(root, valueBranch(root, node))) {
    const declared = (part["properties"] ?? {}) as Record<string, JsonSchema>;
    for (const [key, schema] of Object.entries(declared)) if (!seen.has(key)) seen.set(key, schema);
  }
  return [...seen];
}

/** The keys an object node requires, merged across `allOf`. */
export function requiredOf(root: JsonSchema, node: JsonSchema): string[] {
  return parts(root, valueBranch(root, node)).flatMap((part) =>
    Array.isArray(part["required"]) ? (part["required"] as string[]) : [],
  );
}

/** An array node's item schema and length bounds. */
export function arrayOf(
  root: JsonSchema,
  node: JsonSchema,
): { readonly items: JsonSchema; readonly min: number; readonly max: number } {
  const branch = valueBranch(root, node);
  const items = branch["items"];
  return {
    items: typeof items === "object" || typeof items === "boolean" ? (items as JsonSchema) : true,
    min: bound(branch["minItems"], 0),
    max: bound(branch["maxItems"], Number.POSITIVE_INFINITY),
  };
}

/** The values a node enumerates, from `enum` or from a union of `const`s. */
export function enumOf(root: JsonSchema, node: JsonSchema): unknown[] {
  const listed = valueBranch(root, node)["enum"];
  if (Array.isArray(listed)) return listed.filter((value) => value !== null);
  const consts = branches(root, node)
    .filter((branch) => !isOnlyNull(branch))
    .map((branch) => branch["const"]);
  return consts.length > 1 && consts.every((value) => value !== undefined) ? consts : [];
}

/** A node and every `allOf` member under it, each dereferenced. */
function parts(root: JsonSchema, node: Node): Node[] {
  const all = Array.isArray(node["allOf"]) ? (node["allOf"] as JsonSchema[]) : [];
  return [node, ...all.flatMap((member) => parts(root, deref(root, member)))];
}

function isOnlyNull(node: Node): boolean {
  const types = typesOf(node);
  return (types.length > 0 && types.every((type) => type === "null")) || node["const"] === null;
}

function bound(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/** A local JSON Pointer, `#/$defs/Project`, resolved against `root`. */
function pointer(root: JsonSchema, ref: string): JsonSchema | undefined {
  if (!ref.startsWith("#")) return undefined;
  const steps = ref
    .slice(1)
    .split("/")
    .filter(Boolean)
    .map((step) => decodeURIComponent(step).replaceAll("~1", "/").replaceAll("~0", "~"));
  let current: unknown = root;
  for (const step of steps) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[step];
  }
  return typeof current === "object" || typeof current === "boolean"
    ? (current as JsonSchema)
    : undefined;
}
