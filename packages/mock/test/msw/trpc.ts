/**
 * Two real tRPC routers behind msw: one with superjson, one without.
 *
 * Every fixture in the tRPC suites is written by tRPC's own server, never by
 * the codec under test. A fixture built from the code it checks can only agree
 * with that code, which is how a suite passes against a bug.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { http } from "msw";
import superjson from "superjson";

import type { AnyTRPCRouter } from "@trpc/server";
import type { RequestHandler } from "msw";

export const ORIGIN = "https://preview.example";
export const TYPED = "/api/trpc";
export const PLAIN = "/plain/trpc";

export const CREATED = new Date("2026-01-02T03:04:05.000Z");

const list = () => ({
  items: [
    { id: 1, name: "Atlas", createdAt: CREATED },
    { id: 2, name: "Borealis", createdAt: CREATED },
  ],
  total: 2,
  nextCursor: "c2" as string | null,
});
const me = () => ({ id: "u_1", name: "Reviewer", since: CREATED });
const secret = () => {
  throw new TRPCError({ code: "FORBIDDEN", message: "No access" });
};

// The browser suite runs this router in Chromium, where tRPC refuses to by default.
const typed = initTRPC.create({ transformer: superjson, isDev: false, allowOutsideOfServer: true });
const plain = initTRPC.create({ isDev: false, allowOutsideOfServer: true });

export const typedRouter = typed.router({
  project: typed.router({
    list: typed.procedure.query(list),
    count: typed.procedure.query(() => 2),
    create: typed.procedure.mutation(() => ({ id: 3 })),
  }),
  user: typed.router({ me: typed.procedure.query(me) }),
  secret: typed.procedure.query(secret),
});

export const plainRouter = plain.router({
  project: plain.router({
    list: plain.procedure.query(list),
    count: plain.procedure.query(() => 2),
    create: plain.procedure.mutation(() => ({ id: 3 })),
  }),
  user: plain.router({ me: plain.procedure.query(me) }),
  secret: plain.procedure.query(secret),
});

export type AppRouter = typeof typedRouter;

/** The server's own answer to `request`, straight from tRPC. */
export function serve(request: Request): Promise<Response> {
  const typed = new URL(request.url).pathname.startsWith(TYPED);
  const router: AnyTRPCRouter = typed ? typedRouter : plainRouter;
  return fetchRequestHandler({ endpoint: typed ? TYPED : PLAIN, req: request, router });
}

/** A tRPC server that also counts the requests that reached it. */
export function createTrpcFake() {
  const reached: string[] = [];
  const handler = async ({ request }: { request: Request }) => {
    const url = new URL(request.url);
    reached.push(`${request.method} ${url.pathname}`);
    return serve(request);
  };
  const handlers: RequestHandler[] = [
    http.all(`${ORIGIN}${TYPED}/*`, handler),
    http.all(`${ORIGIN}${PLAIN}/*`, handler),
  ];
  const reset = () => {
    reached.length = 0;
  };
  return { handlers, reached, reset };
}

/** A batch GET the way `httpBatchLink` writes one. */
export function batchUrl(endpoint: string, paths: readonly string[]): string {
  const input = Object.fromEntries(paths.map((_, index) => [String(index), {}]));
  return `${ORIGIN}${endpoint}/${paths.join(",")}?batch=1&input=${encodeURIComponent(JSON.stringify(input))}`;
}

export const STREAM_HEADERS = { "trpc-accept": "application/jsonl" };
