/**
 * A call's shape, the wire format between the route and the page, and
 * the normaliser that turns an OpenAPI document into one shape per call key.
 *
 * The route serves shapes and `@maple-kit/mock` reads them, so the format
 * lives here with the recipe. `docs/mock.md` records the ladder of sources.
 */

/** A JSON Schema, as JSON. `true` accepts anything, `false` nothing. */
export type JsonSchema = boolean | { readonly [keyword: string]: unknown };

/** Where a shape came from, highest rung first. */
export const SHAPE_SOURCES = [
  "supplied",
  "router",
  "validator",
  "introspection",
  "sample",
] as const;

/** One rung of the ladder. */
export type ShapeSource = (typeof SHAPE_SOURCES)[number];

/** One call's response, as a JSON Schema over what its data decodes to. */
export interface Shape {
  readonly schema: JsonSchema;
  readonly source: ShapeSource;
  /** The call travels in superjson's envelope, so a sampled date is a `Date`. */
  readonly superjson?: boolean;
}

/** An OpenAPI document, and how its operations map to call keys. */
export interface SchemaDocument {
  /** OpenAPI 3.0 or 3.1, as parsed JSON. */
  readonly document: unknown;
  /** `trpc` for a document of procedures, such as `maple mock schema` writes. */
  readonly codec: "rest" | "trpc";
  /** The rung it stands on. `supplied` unless given. */
  readonly source?: ShapeSource;
  /** Every call in it travels in superjson's envelope. */
  readonly superjson?: boolean;
  /** Put before each REST path, when the document's paths are relative to a server. */
  readonly prefix?: string;
}

/** Shapes by call key, with REST path templates matched. */
export interface ShapeIndex {
  find(key: string): Shape | undefined;
  readonly size: number;
}

const SOURCES: ReadonlySet<string> = new Set(SHAPE_SOURCES);
const METHODS = ["get", "post", "put", "patch", "delete"] as const;

/** Whether `value` is a shape as the route writes one. */
export function isShape(value: unknown): value is Shape {
  if (!isRecord(value)) return false;
  const { schema, source, superjson } = value;
  if (!(typeof schema === "boolean" || isRecord(schema))) return false;
  if (typeof source !== "string" || !SOURCES.has(source)) return false;
  return superjson === undefined || typeof superjson === "boolean";
}

/**
 * Every document's shapes, merged: the first document that describes a key
 * wins on structure, so list them highest rung first.
 */
export function createShapeIndex(documents: readonly SchemaDocument[]): ShapeIndex {
  const exact = new Map<string, Shape>();
  const templates: { method: string; segments: string[]; shape: Shape }[] = [];

  for (const source of documents) {
    for (const [key, shape] of shapesOf(source)) {
      if (exact.has(key)) continue;
      exact.set(key, shape);
      const rest = /^rest:([A-Z]+) (.*)$/.exec(key);
      if (rest?.[2]?.includes("{")) {
        templates.push({ method: rest[1]!, segments: rest[2].split("/"), shape });
      }
    }
  }

  return {
    size: exact.size,
    find(key) {
      const found = exact.get(key);
      if (found !== undefined) return found;
      const rest = /^rest:([A-Z]+) (.*)$/.exec(key);
      if (rest === null) return undefined;
      const segments = rest[2]!.split("/");
      return templates.find(
        (template) => template.method === rest[1] && matches(template.segments, segments),
      )?.shape;
    },
  };
}

/** One document's shapes by key. An operation with no JSON 2xx response has none. */
function shapesOf(source: SchemaDocument): [string, Shape][] {
  const doc = isRecord(source.document) ? source.document : {};
  const paths = isRecord(doc["paths"]) ? doc["paths"] : {};
  const components = doc["components"];
  const found: [string, Shape][] = [];

  for (const [path, item] of Object.entries(paths)) {
    if (!isRecord(item)) continue;
    for (const method of METHODS) {
      const schema = responseSchema(item[method], source.codec);
      if (schema === undefined) continue;
      const key = keyOf(source, path, method);
      const root = components === undefined ? schema : withComponents(schema, components);
      found.push([key, shapeFor(root, source)]);
    }
  }
  return found;
}

function shapeFor(schema: JsonSchema, source: SchemaDocument): Shape {
  return {
    schema,
    source: source.source ?? "supplied",
    ...(source.superjson === true ? { superjson: true } : {}),
  };
}

function keyOf(source: SchemaDocument, path: string, method: string): string {
  if (source.codec === "trpc") return `trpc:${path.replace(/^\//, "")}`;
  const full = `${source.prefix ?? ""}${path}`.replace(/\/{2,}/g, "/");
  return `rest:${method.toUpperCase()} ${full.length > 1 ? full.replace(/\/$/, "") : full}`;
}

/** The first 2xx JSON response's schema, for tRPC its `result.data`. `true` describes nothing. */
function responseSchema(
  operation: unknown,
  codec: SchemaDocument["codec"],
): Record<string, unknown> | undefined {
  if (!isRecord(operation) || !isRecord(operation["responses"])) return undefined;
  const status = Object.keys(operation["responses"])
    .filter((code) => /^2(\d\d|XX)$/i.test(code))
    .sort((a, b) => a.localeCompare(b))[0];
  const response = status === undefined ? undefined : operation["responses"][status];
  const content = isRecord(response) && isRecord(response["content"]) ? response["content"] : {};
  const type = Object.keys(content).find((name) => /json/i.test(name));
  const media = type === undefined ? undefined : content[type];
  const schema = isRecord(media) ? media["schema"] : undefined;
  if (!isRecord(schema)) return undefined;
  return codec === "trpc" ? trpcData(schema) : schema;
}

/** tRPC answers `{ result: { data } }`; the shape is of `data`. */
function trpcData(schema: Record<string, unknown>): Record<string, unknown> {
  const result = isRecord(schema["properties"]) ? schema["properties"]["result"] : undefined;
  const data =
    isRecord(result) && isRecord(result["properties"]) ? result["properties"]["data"] : undefined;
  return isRecord(data) ? data : schema;
}

/** The schema with the document's components beside it, so its `$ref`s resolve. */
function withComponents(schema: JsonSchema, components: unknown): JsonSchema {
  return typeof schema === "boolean" ? schema : { ...schema, components };
}

/** A template's `{param}` matches any one segment; the rest match exactly. */
function matches(template: readonly string[], segments: readonly string[]): boolean {
  if (template.length !== segments.length) return false;
  return template.every((part, index) => /^\{[^}]+\}$/.test(part) || part === segments[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
