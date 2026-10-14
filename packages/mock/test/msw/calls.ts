/**
 * A fake of Maple's `GET {base}/mock/calls`, over a fixed list, 20 a page. It
 * records each request's query string, so a test can say nothing asked.
 */

import { http, HttpResponse } from "msw";

import type { CallEntry } from "@maple-kit/core/mock";
import type { RequestHandler } from "msw";

export const CALLS_URL = "https://preview.example.com/api/maple/mock/calls";

const PAGE = 20;

/** Thirty described calls, and the two a test names. */
export const DESCRIBED: readonly CallEntry[] = [
  {
    key: "rest:GET /api/orders/{id}",
    method: "GET",
    path: "/api/orders/{id}",
    summary: "One order",
  },
  { key: "rest:GET /api/invoices", method: "GET", path: "/api/invoices", summary: "List invoices" },
  ...Array.from({ length: 28 }, (_, n) => ({
    key: `rest:GET /api/bulk/${String(n)}`,
    method: "GET",
    path: `/api/bulk/${String(n)}`,
  })),
];

export interface CallsFake {
  readonly handlers: RequestHandler[];
  /** Each request's `q` and `cursor`, in order. */
  readonly asked: { q: string; cursor: string | null }[];
  /** The next request answers with this status. */
  failNext(status: number): void;
  reset(): void;
}

export function createCallsFake(calls: readonly CallEntry[] = DESCRIBED): CallsFake {
  const asked: CallsFake["asked"] = [];
  let failure: number | undefined;
  const handlers = [
    http.get(CALLS_URL, ({ request }) => {
      const url = new URL(request.url);
      const q = url.searchParams.get("q") ?? "";
      const cursor = url.searchParams.get("cursor");
      asked.push({ q, cursor });
      if (failure !== undefined) {
        const status = failure;
        failure = undefined;
        return HttpResponse.json({ error: "no" }, { status });
      }
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      const found = calls.filter((call) =>
        words.every((word) => `${call.path} ${call.summary ?? ""}`.toLowerCase().includes(word)),
      );
      const start = Number(cursor ?? 0);
      const end = start + PAGE;
      return HttpResponse.json({
        calls: found.slice(start, end),
        ...(end < found.length ? { next: String(end) } : {}),
      });
    }),
  ];
  return {
    handlers,
    asked,
    failNext(status) {
      failure = status;
    },
    reset() {
      asked.length = 0;
      failure = undefined;
    },
  };
}
