/**
 * tRPC's streamed batch (`httpBatchStreamLink`), read and written.
 *
 * A head line names a promise per call; later lines settle them, one level at
 * a time: the call, its `result`, its `data`. With a transformer, each whole
 * line is serialised, so a value's annotations sit under `2.0.0` of its line.
 */

import { extractMeta, isWrapped, prefixMeta, wrap } from "./superjson.js";

import type { TypeMeta } from "./superjson.js";

/** One call's settled item, as a plain batch carries it. */
export type Item =
  | { readonly kind: "result"; readonly data: unknown; readonly meta?: TypeMeta }
  | { readonly kind: "error"; readonly error: unknown; readonly meta?: TypeMeta };

interface Line {
  readonly value: unknown;
  /** Absent when the line was not in superjson's envelope. */
  readonly meta?: TypeMeta;
}

type Encoded = [data: [unknown] | [], ...definitions: [string | null, number, number][]];

/** Where a line's own value sits inside it: `[chunk, status, [[value], …]]`. */
const VALUE_AT = [2, 0, 0] as const;

/** The items a stream settles, in call order, or undefined when it cannot be read. */
export function decodeStream(text: string, count: number): readonly Item[] | undefined {
  const lines = parseLines(text);
  if (lines === undefined) return undefined;
  const [head, ...rest] = lines;
  const chunks = new Map<number, Line>();
  for (const line of rest) {
    if (Array.isArray(line.value) && typeof line.value[0] === "number") {
      chunks.set(line.value[0], line);
    }
  }
  const items: Item[] = [];
  for (let index = 0; index < count; index++) {
    const encoded = (head?.value as Record<string, Encoded> | undefined)?.[String(index)];
    const item = encoded === undefined ? undefined : settle(encoded, chunks);
    if (item === undefined) return undefined;
    items.push(item);
  }
  return items;
}

function parseLines(text: string): Line[] | undefined {
  try {
    return text
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => {
        const parsed = JSON.parse(line) as unknown;
        return isWrapped(parsed)
          ? { value: parsed.json, meta: parsed.meta ?? {} }
          : { value: parsed };
      });
  } catch {
    return undefined;
  }
}

/** Follows a call's promise down to its `data` or its `error`. */
function settle(encoded: Encoded, chunks: Map<number, Line>): Item | undefined {
  const call = follow(encoded, null, chunks);
  if (call?.kind !== "value") return call?.kind === "rejected" ? call.item : undefined;
  const settled = call.value as { error?: unknown; result?: unknown };
  if ("error" in settled) {
    return {
      kind: "error",
      error: settled.error,
      ...within(call.meta, [...VALUE_AT, "error"]),
    };
  }
  const result = follow(call.encoded, "result", chunks);
  if (result?.kind !== "value") return result?.kind === "rejected" ? result.item : undefined;
  const data = follow(result.encoded, "data", chunks);
  if (data?.kind !== "value") return data?.kind === "rejected" ? data.item : undefined;
  if (data.encoded.length > 1) return undefined;
  return { kind: "result", data: data.value, ...within(data.meta, VALUE_AT) };
}

type Followed =
  | { kind: "value"; value: unknown; encoded: Encoded; meta?: TypeMeta }
  | { kind: "rejected"; item: Item };

/** The chunk the definition at `key` points to, settled. */
function follow(
  encoded: Encoded,
  key: string | null,
  chunks: Map<number, Line>,
): Followed | undefined {
  const [, ...definitions] = encoded;
  const definition = definitions.find(([at]) => at === key);
  if (definition === undefined) return undefined;
  const [, type, id] = definition;
  const line = chunks.get(id);
  if (type !== 0 || line === undefined) return undefined;
  const [, status, payload] = line.value as [number, number, unknown];
  if (status !== 0) {
    return {
      kind: "rejected",
      item: { kind: "error", error: payload, ...within(line.meta, [2]) },
    };
  }
  const next = payload as Encoded;
  return {
    kind: "value",
    value: next[0][0],
    encoded: next,
    ...(line.meta ? { meta: line.meta } : {}),
  };
}

/** A line's annotations for the value at `prefix`, when the line had any envelope. */
function within(meta: TypeMeta | undefined, prefix: readonly (number | string)[]) {
  return meta === undefined ? {} : { meta: extractMeta(meta, prefix) };
}

/**
 * `items` as tRPC's own producer writes them for calls that settle at once:
 * the head, then failed calls, then each level of the rest, in call order.
 */
export function encodeStream(items: readonly Item[], wrapped: boolean): string {
  const count = items.length;
  const head = Object.fromEntries(
    items.map((_, index) => [String(index), [[0], [null, 0, index]]]),
  );
  const lines: Line[] = [{ value: head, meta: {} }];
  const results = items.flatMap((item, index) => (item.kind === "result" ? [{ item, index }] : []));

  items.forEach((item, index) => {
    if (item.kind !== "error") return;
    const meta = prefixMeta(item.meta ?? {}, [...VALUE_AT, "error"]);
    lines.push({ value: [index, 0, [[{ error: item.error }]]], meta });
  });
  results.forEach(({ index }, order) => {
    lines.push({ value: [index, 0, [[{ result: 0 }], ["result", 0, count + order]]], meta: {} });
  });
  results.forEach((_, order) => {
    const data = count + results.length + order;
    lines.push({ value: [count + order, 0, [[{ data: 0 }], ["data", 0, data]]], meta: {} });
  });
  results.forEach(({ item }, order) => {
    const value = item.data === undefined ? [] : [item.data];
    const meta = prefixMeta(item.meta ?? {}, VALUE_AT);
    lines.push({ value: [count + results.length + order, 0, [value]], meta });
  });

  return lines
    .map((line) => `${JSON.stringify(wrapped ? wrap(line.value, line.meta ?? {}) : line.value)}\n`)
    .join("");
}
