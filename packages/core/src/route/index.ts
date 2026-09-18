/**
 * The one route Maple asks an application to mount.
 *
 * It is deliberately web-standard — a `Request` in, a `Response` out — so the
 * same handler serves a Next route handler, a Vite middleware, Hono, Express
 * through an adapter, and a Worker.
 */

export { createMapleHandler, DEFAULT_BASE_PATH } from "./handler.js";
export type { RouteOptions } from "./handler.js";

export { toNodeMiddleware } from "./node.js";
export type { NodeMiddleware } from "./node.js";
