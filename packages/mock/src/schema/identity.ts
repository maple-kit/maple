/**
 * The host's identity rules, read once from Maple's route,
 * `GET {base}/mock/identity`, and only by a page whose recipe has `as`.
 */

import { isIdentityRules } from "@maple-kit/core/mock";

import type { IdentityRules } from "@maple-kit/core/mock";

/** Where the route is, and how to reach it past the interceptor. */
export interface RouteIdentityOptions {
  /** Where Maple's route is mounted, such as `/api/maple`. */
  readonly basePath: string;
  /** The real `fetch`, so the request is not itself intercepted. */
  readonly fetch: typeof fetch;
  /** Defaults to the page's own origin. */
  readonly origin?: string;
}

/** The rules the route serves, or undefined when it declares none or cannot be read. */
export async function routeIdentity(
  options: RouteIdentityOptions,
): Promise<IdentityRules | undefined> {
  const base =
    options.origin ?? (typeof location === "undefined" ? "http://localhost" : location.origin);
  const url = new URL(`${options.basePath.replace(/\/$/, "")}/mock/identity`, base);
  try {
    const response = await options.fetch(url, { credentials: "same-origin" });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { identity?: unknown };
    return isIdentityRules(body.identity) ? body.identity : undefined;
  } catch {
    return undefined;
  }
}
