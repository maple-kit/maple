/**
 * Maple's route answering `/mock/schema`, with what it was asked. A key named
 * `broken:*` makes it fail with a 500, so a lookup's error path is exercised.
 */

import { http, HttpResponse } from "msw";

import type { Shape } from "@maple-kit/core/mock";
import type { RequestHandler } from "msw";

export const ROUTE_ORIGIN = "https://preview.example";

export const SHAPES: Readonly<Record<string, Shape>> = {
  "rest:GET /api/projects": { schema: { type: "array" }, source: "supplied" },
  "trpc:user.me": { schema: { type: "object" }, source: "router", superjson: true },
};

export function createShapeRoute() {
  const asked: string[][] = [];
  const handlers: RequestHandler[] = [
    http.get(`${ROUTE_ORIGIN}/api/maple/mock/schema`, ({ request }) => {
      const keys = new URL(request.url).searchParams.getAll("key");
      asked.push(keys);
      if (keys.some((key) => key.startsWith("broken:"))) {
        return HttpResponse.json({ error: "upstream" }, { status: 500 });
      }
      const shapes = Object.fromEntries(
        keys.flatMap((key) => (SHAPES[key] ? [[key, SHAPES[key]]] : [])),
      );
      return HttpResponse.json({ shapes: { ...shapes, "rest:GET /junk": { source: "made-up" } } });
    }),
  ];
  const reset = () => {
    asked.length = 0;
  };
  return { handlers, asked, reset };
}
