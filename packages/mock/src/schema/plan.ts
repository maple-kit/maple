/**
 * A sentence planned by Maple's route, `POST {base}/mock/plan`. The page never
 * reaches a model: the route holds the classifier, and a build that is not a
 * preview, or has no planner, answers 404.
 */

import type { MockPlan, MockPlanRequest } from "@maple-kit/core/connectors";

/** Asks the route for a plan. Null for a sentence with nothing in it yet. */
export type PlanLookup = (
  request: MockPlanRequest,
  signal?: AbortSignal,
) => Promise<MockPlan | null>;

/** Raised when the route has no planner, so the box stops asking. */
export class PlanUnavailableError extends Error {
  override readonly name = "PlanUnavailableError";
}

/** Where the route is, and how to reach it past the interceptor. */
export interface RoutePlanOptions {
  /** Where Maple's route is mounted, such as `/api/maple`. */
  readonly basePath: string;
  /** The real `fetch`, so the request is not itself intercepted. */
  readonly fetch: typeof fetch;
  /** Defaults to the page's own origin. */
  readonly origin?: string;
}

/**
 * A lookup over the route's planner.
 *
 * @throws {PlanUnavailableError} when the route answers 404.
 */
export function routePlan(options: RoutePlanOptions): PlanLookup {
  const url = new URL(`${options.basePath.replace(/\/$/, "")}/mock/plan`, origin(options));

  return async ({ request, route, calls, flags }, signal) => {
    const response = await options.fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request, route, calls, ...(flags === undefined ? {} : { flags }) }),
      ...(signal === undefined ? {} : { signal }),
    });
    if (response.status === 404) throw new PlanUnavailableError("This route plans nothing.");
    if (!response.ok) throw new Error(`The route could not plan: ${String(response.status)}`);
    const body = (await response.json()) as { plan?: MockPlan | null };
    return body.plan ?? null;
  };
}

function origin(options: RoutePlanOptions): string {
  return options.origin ?? (typeof location === "undefined" ? "http://localhost" : location.origin);
}
