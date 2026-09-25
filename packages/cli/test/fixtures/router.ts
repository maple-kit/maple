/** A small router for `maple mock schema` to read. Nothing runs it. */

import { initTRPC } from "@trpc/server";

const t = initTRPC.create();

interface Project {
  readonly id: string;
  readonly status: "active" | "paused";
  readonly createdAt: Date;
}

const projects: Project[] = [];

export const appRouter = t.router({
  project: t.router({
    list: t.procedure.query(() => ({ items: projects, nextCursor: null as string | null })),
    create: t.procedure.mutation(() => ({ id: "p_1" })),
  }),
});

export type AppRouter = typeof appRouter;
