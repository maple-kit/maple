/**
 * Shapes read from Maple's route, `GET {base}/mock/schema`, as the page needs
 * them. Keys asked for in the same tick go in one request, and every answer,
 * a miss included, is kept for the page's life: shapes change with a deploy.
 */

import { isShape } from "@maple-kit/core/mock";

import type { ShapeLookup } from "./shape.js";
import type { Shape } from "@maple-kit/core/mock";

/** Where the route is, and how to reach it past the interceptor. */
export interface RouteShapesOptions {
  /** Where Maple's route is mounted, such as `/api/maple`. */
  readonly basePath: string;
  /** The real `fetch`, so the request is not itself intercepted. */
  readonly fetch: typeof fetch;
  /** Defaults to the page's own origin. */
  readonly origin?: string;
}

/** The most keys one request carries, matching the route's own limit. */
const PER_REQUEST = 100;

/** A lookup over the route's shapes. */
export function routeShapes(options: RouteShapesOptions): ShapeLookup {
  const known = new Map<string, Promise<Shape | undefined>>();
  let waiting: Map<string, (shape: Shape | undefined) => void> | undefined;

  const flush = (batch: Map<string, (shape: Shape | undefined) => void>) => {
    const keys = [...batch.keys()];
    for (let start = 0; start < keys.length; start += PER_REQUEST) {
      const chunk = keys.slice(start, start + PER_REQUEST);
      void read(options, chunk).then((shapes) => {
        for (const key of chunk) batch.get(key)?.(shapes[key]);
      });
    }
  };

  return (key) => {
    const found = known.get(key);
    if (found !== undefined) return found;
    const promise = new Promise<Shape | undefined>((settle) => {
      if (waiting === undefined) {
        const batch = new Map<string, (shape: Shape | undefined) => void>();
        waiting = batch;
        queueMicrotask(() => {
          waiting = undefined;
          flush(batch);
        });
      }
      waiting.set(key, settle);
    });
    known.set(key, promise);
    return promise;
  };
}

/** The shapes the route has for `keys`; nothing, when it cannot be read. */
async function read(options: RouteShapesOptions, keys: readonly string[]) {
  const url = new URL(`${options.basePath.replace(/\/$/, "")}/mock/schema`, origin(options));
  for (const key of keys) url.searchParams.append("key", key);
  try {
    const response = await options.fetch(url, { credentials: "same-origin" });
    if (!response.ok) return {};
    const body = (await response.json()) as { shapes?: unknown };
    return shapesIn(body.shapes);
  } catch {
    return {};
  }
}

function shapesIn(value: unknown): Record<string, Shape> {
  if (typeof value !== "object" || value === null) return {};
  return Object.fromEntries(Object.entries(value).filter(([, shape]) => isShape(shape)));
}

function origin(options: RouteShapesOptions): string {
  return options.origin ?? (typeof location === "undefined" ? "http://localhost" : location.origin);
}
