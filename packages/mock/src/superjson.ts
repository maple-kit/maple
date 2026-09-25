/**
 * Just enough of superjson's wire format to keep its `meta` true: the paths
 * that say which values were a `Date`, a `bigint` or a `Map`.
 *
 * Nothing here deserialises. A reshaped body keeps its values as JSON, and
 * only the annotations move with them. The format is superjson's own, read
 * from its `pathstringifier` and `plainer` modules (MIT).
 */

/** superjson's `meta`, opaque apart from where its paths point. */
export interface TypeMeta {
  readonly values?: unknown;
  readonly referentialEqualities?: unknown;
  readonly v?: number;
}

type Path = readonly (number | string)[];

/** Whether `value` is superjson's `{ json, meta? }` envelope. */
export function isWrapped(value: unknown): value is { json: unknown; meta?: TypeMeta } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.includes("json") && keys.every((key) => key === "json" || key === "meta");
}

/** `body` in superjson's envelope, with `meta` only when it says something. */
export function wrap(body: unknown, meta: TypeMeta): unknown {
  return Object.keys(meta).length === 0 ? { json: body } : { json: body, meta };
}

/** superjson's escaping: a dot in a key is `\.`, a backslash is `\\`. */
export function stringifyPath(path: Path): string {
  return path
    .map((segment) => String(segment).replaceAll("\\", "\\\\").replaceAll(".", "\\."))
    .join(".");
}

/** The inverse of {@link stringifyPath}. */
export function parsePath(text: string): string[] {
  const segments: string[] = [];
  let segment = "";
  for (let index = 0; index < text.length; index++) {
    const char = text.charAt(index);
    if (char === "\\" && index + 1 < text.length) {
      segment += text.charAt(++index);
    } else if (char === ".") {
      segments.push(segment);
      segment = "";
    } else {
      segment += char;
    }
  }
  segments.push(segment);
  return segments;
}

/**
 * `meta` for a value moved to `prefix` inside a larger one, as superjson
 * writes it when it serialises the larger value whole.
 */
export function prefixMeta(meta: TypeMeta, prefix: Path): TypeMeta {
  const at = stringifyPath(prefix);
  const under = (key: string) => (key === "" ? at : `${at}.${key}`);
  return rebuild(
    meta,
    (values) => mapTree(values, under),
    (equalities) => mapEqualities(equalities, under),
  );
}

/** The part of `meta` under `prefix`, with paths made relative to it. */
export function extractMeta(meta: TypeMeta, prefix: Path): TypeMeta {
  const at = stringifyPath(prefix);
  const inside = (key: string) => {
    if (key === at) return "";
    return key.startsWith(`${at}.`) ? key.slice(at.length + 1) : undefined;
  };
  return rebuild(
    meta,
    (values) => mapTree(values, inside),
    (equalities) => pickEqualities(equalities, inside),
  );
}

function rebuild(
  meta: TypeMeta,
  values: (tree: unknown) => unknown,
  equalities: (tree: unknown) => unknown,
): TypeMeta {
  const next: { values?: unknown; referentialEqualities?: unknown; v?: number } = {};
  const mappedValues = meta.values === undefined ? undefined : values(meta.values);
  const mappedEqualities =
    meta.referentialEqualities === undefined ? undefined : equalities(meta.referentialEqualities);
  if (mappedValues !== undefined) next.values = mappedValues;
  if (mappedEqualities !== undefined) next.referentialEqualities = mappedEqualities;
  if (Object.keys(next).length > 0 && meta.v !== undefined) next.v = meta.v;
  return next;
}

/** A root array node is the value's own annotation; an object maps paths to nodes. */
function mapTree(tree: unknown, rename: (key: string) => string | undefined): unknown {
  const entries: [string, unknown][] = Array.isArray(tree)
    ? [["", tree]]
    : Object.entries(tree as Record<string, unknown>);
  const mapped = entries.flatMap(([key, node]) => {
    const renamed = rename(key);
    return renamed === undefined ? [] : [[renamed, node] as const];
  });
  if (mapped.length === 0) return undefined;
  const root = mapped.find(([key]) => key === "");
  if (root !== undefined && mapped.length === 1) return root[1];
  return Object.fromEntries(mapped);
}

function mapEqualities(tree: unknown, rename: (key: string) => string): unknown {
  return Object.fromEntries(
    Object.entries(equalityEntries(tree)).map(([key, paths]) => [rename(key), paths.map(rename)]),
  );
}

/** The equalities whose paths fall inside, renamed, in the form superjson writes. */
function pickEqualities(tree: unknown, rename: (key: string) => string | undefined): unknown {
  const picked = Object.entries(equalityEntries(tree)).flatMap(([key, paths]) => {
    const renamed = rename(key);
    const inside = paths.map(rename).filter((path): path is string => path !== undefined);
    return renamed === undefined || inside.length === 0 ? [] : [[renamed, inside] as const];
  });
  if (picked.length === 0) return undefined;
  const root = picked.find(([key]) => key === "");
  const rest = Object.fromEntries(picked.filter(([key]) => key !== ""));
  if (root === undefined) return rest;
  return Object.keys(rest).length === 0 ? [root[1]] : [root[1], rest];
}

function equalityEntries(tree: unknown): Record<string, string[]> {
  if (!Array.isArray(tree)) return tree as Record<string, string[]>;
  const [root, other] = tree as [string[], Record<string, string[]> | undefined];
  return { "": root, ...other };
}

const MARK = "\u0000maple-mock-annotation";

interface Marker {
  readonly [MARK]: unknown;
  readonly value: unknown;
}

/** `fn` applied to a value, through its marker if it has one. */
export function throughMarker(value: unknown, fn: (value: unknown) => unknown): unknown {
  if (typeof value !== "object" || value === null || !(MARK in value)) return fn(value);
  const marker = value as Marker;
  return { [MARK]: marker[MARK], value: fn(marker.value) } satisfies Marker;
}

/**
 * `body` with every annotated value wrapped in a marker that travels with it,
 * so a transform that drops or copies a value drops or copies its annotation.
 */
export function inflate(body: unknown, meta: TypeMeta): unknown {
  const values = meta.values;
  if (values === undefined) return body;
  if (Array.isArray(values)) return { [MARK]: values, value: body } satisfies Marker;
  let inflated = structuredClone(body);
  for (const [key, node] of Object.entries(values as Record<string, unknown>)) {
    inflated = mark(inflated, parsePath(key), node);
  }
  return inflated;
}

function mark(root: unknown, path: readonly string[], node: unknown): unknown {
  const [head, ...rest] = path;
  if (head === undefined) return { [MARK]: node, value: root } satisfies Marker;
  if (typeof root !== "object" || root === null) return root;
  const container = root as Record<string, unknown>;
  if (head in container) container[head] = mark(container[head], rest, node);
  return root;
}

/** The inverse of {@link inflate}: plain JSON again, and the `meta` that describes it. */
export function deflate(inflated: unknown, v = 1): { body: unknown; meta: TypeMeta } {
  const values: Record<string, unknown> = {};
  const body = unmark(inflated, [], values);
  // A root annotation carries its children inside it, so it is the whole tree.
  const root = values[""];
  if (root !== undefined) return { body, meta: { values: root, v } };
  return { body, meta: Object.keys(values).length === 0 ? {} : { values, v } };
}

function unmark(value: unknown, path: Path, values: Record<string, unknown>): unknown {
  if (typeof value !== "object" || value === null) return value;
  if (MARK in value) {
    values[stringifyPath(path)] = (value as Marker)[MARK];
    return (value as Marker).value;
  }
  if (Array.isArray(value))
    return value.map((item, index) => unmark(item, [...path, index], values));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, unmark(item, [...path, key], values)]),
  );
}
