/**
 * The example's tRPC router, in the shape production apps use: superjson,
 * a batch the page streams, and one subscription over server-sent events.
 */

import { initTRPC } from "@trpc/server";
import superjson from "superjson";

import { ME, PROJECTS } from "./data";

// Off, so an error body never carries a stack with this machine's paths in it.
const t = initTRPC.create({ transformer: superjson, isDev: false });

/** How long `project.slow` takes, so a held batch is easy to see. */
export const SLOW_MS = 1500;

// On the global, since each route handler is its own bundle with its own copy
// of this module, and the counter has to be the same one in both.
const COUNTER = Symbol.for("example-next.created");
const created = ((globalThis as { [COUNTER]?: { count: number } })[COUNTER] ??= { count: 0 });

/** How many creates reached the server. A mocked one never does. */
export function createdCount(): number {
  return created.count;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const project = t.router({
  list: t.procedure.query(() => ({
    items: PROJECTS,
    total: PROJECTS.length,
    nextCursor: null as string | null,
  })),
  count: t.procedure.query(() => PROJECTS.length),
  slow: t.procedure.query(async () => {
    await sleep(SLOW_MS);
    return { waitedMs: SLOW_MS };
  }),
  create: t.procedure.mutation(() => {
    created.count += 1;
    return { id: `p_new_${String(created.count)}` };
  }),
});

const user = t.router({ me: t.procedure.query(() => ME) });

const activity = t.router({
  onEvent: t.procedure.subscription(async function* ({ signal }) {
    let tick = 0;
    while (signal?.aborted !== true) {
      await sleep(1000, signal);
      yield { tick: ++tick, at: new Date() };
    }
  }),
});

export const appRouter = t.router({ project, user, activity });

export type AppRouter = typeof appRouter;
