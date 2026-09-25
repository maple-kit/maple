/**
 * The tRPC codec: `/api/trpc/a,b?batch=1` is two calls, `trpc:a` and `trpc:b`.
 *
 * A partial mock still sends the real request, and only the named calls are
 * replaced in the answer, so the server stays the truth for the rest. A
 * streamed batch is fetched as a plain one and written back as a stream.
 */

import { keptHeaders } from "./codec.js";
import { decodeStream, encodeStream } from "./jsonl.js";
import { isJson } from "./rest.js";
import { isWrapped, wrap } from "./superjson.js";

import type { Answer, Call, Codec } from "./codec.js";
import type { Item } from "./jsonl.js";

/** How the codec finds tRPC requests and how their bodies travel. */
export interface TrpcCodecOptions {
  /** The path the tRPC handler is mounted at. Defaults to `/api/trpc`. */
  readonly endpoint?: string;
  /**
   * `"superjson"` when the router uses it. Usually unnecessary: the envelope
   * is read from the responses. It matters for a failure nothing was fetched for.
   */
  readonly transformer?: "superjson";
}

interface TrpcCall extends Call {
  readonly path: string;
  readonly batch: boolean;
  readonly stream: boolean;
}

const STREAM = "application/jsonl";

const FAILURES = {
  error: { code: -32603, key: "INTERNAL_SERVER_ERROR", status: 500 },
  forbidden: { code: -32003, key: "FORBIDDEN", status: 403 },
} as const;

/** The status of an answered item, as tRPC's `getHTTPStatusCode` reads it. */
function statusOf(item: Item): number {
  if (item.kind === "result") return 200;
  const data = (item.error as { data?: { httpStatus?: unknown } } | undefined)?.data;
  return typeof data?.httpStatus === "number" ? data.httpStatus : 500;
}

function toAnswer(raw: unknown): Answer {
  const entry = raw as { error?: unknown; result?: { data?: unknown } };
  const payload = "error" in entry ? entry.error : entry.result?.data;
  const unwrapped = isWrapped(payload)
    ? { body: payload.json, meta: payload.meta ?? {} }
    : { body: payload };
  const status = "error" in entry ? statusOf({ kind: "error", error: unwrapped.body }) : 200;
  return { kind: "data", status, ...unwrapped };
}

function fromItem(item: Item): Answer {
  const body = item.kind === "result" ? item.data : item.error;
  return { kind: "data", status: statusOf(item), body, ...(item.meta ? { meta: item.meta } : {}) };
}

function toItem(answer: Answer, call: TrpcCall): Item {
  if (answer.kind === "failure") {
    const failure = FAILURES[answer.state];
    const data = { code: failure.key, httpStatus: failure.status, path: call.path };
    return { kind: "error", error: { message: failure.key, code: failure.code, data } };
  }
  const meta = answer.meta ?? {};
  if (answer.status >= 200 && answer.status < 300)
    return { kind: "result", data: answer.body, meta };
  return { kind: "error", error: answer.body, meta };
}

function plain(item: Item, wrapped: boolean): unknown {
  const payload = item.kind === "result" ? item.data : item.error;
  const encoded = wrapped ? wrap(payload, item.meta ?? {}) : payload;
  if (item.kind === "error") return { error: encoded };
  return encoded === undefined ? { result: {} } : { result: { data: encoded } };
}

/** A tRPC codec. Put it before the REST codec, which claims everything. */
export function trpcCodec(options: TrpcCodecOptions = {}): Codec {
  const endpoint = (options.endpoint ?? "/api/trpc").replace(/\/$/, "");

  function split(request: Request): Promise<TrpcCall[] | undefined> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(`${endpoint}/`)) return Promise.resolve(undefined);
    const paths = decodeURIComponent(url.pathname.slice(endpoint.length + 1)).split(",");
    const batch = url.searchParams.get("batch") === "1";
    const stream = request.headers.get("trpc-accept") === STREAM;
    return Promise.resolve(paths.map((path) => ({ key: `trpc:${path}`, path, batch, stream })));
  }

  async function read(response: Response, calls: readonly Call[]) {
    if (!isJson(response.headers.get("content-type"))) return undefined;
    const text = await response.text();
    const first = calls[0] as TrpcCall | undefined;
    try {
      const parsed = JSON.parse(text) as unknown;
      const items = first?.batch === true ? parsed : [parsed];
      if (!Array.isArray(items) || items.length !== calls.length) return undefined;
      return items.map(toAnswer);
    } catch {
      if (first?.stream !== true) return undefined;
      return decodeStream(text, calls.length)?.map(fromItem);
    }
  }

  function join(calls: readonly Call[], answers: readonly Answer[], real?: Response): Response {
    const trpcCalls = calls as readonly TrpcCall[];
    const items = answers.map((answer, index) => toItem(answer, trpcCalls[index] as TrpcCall));
    const wrapped =
      options.transformer === "superjson" || answers.some((answer) => answer.meta !== undefined);
    const headers = keptHeaders(real, "application/json");

    const first = trpcCalls[0];
    if (first?.stream === true)
      return new Response(encodeStream(items, wrapped), { status: 200, headers });
    const statuses = new Set(items.map(statusOf));
    const status = statuses.size === 1 ? [...statuses][0] : 207;
    const body =
      first?.batch === true
        ? items.map((item) => plain(item, wrapped))
        : plain(items[0] as Item, wrapped);
    return new Response(JSON.stringify(body), { status: status ?? 200, headers });
  }

  function prepare(request: Request): Request {
    if (request.headers.get("trpc-accept") !== STREAM) return request;
    const headers = new Headers(request.headers);
    headers.delete("trpc-accept");
    return new Request(request, { headers });
  }

  return { name: "trpc", split, read, join, prepare };
}
