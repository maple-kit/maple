/**
 * A sentence planned by Maple's route, `POST {base}/mock/plan`. The page never
 * reaches a model: the route holds the classifier, and a build that is not a
 * preview, or has no planner, answers 404.
 */

import { encodeBody, mergePlans, splitRequest } from "./plan-body.js";

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

/** Raised when the route answered, or could not be reached, and no plan came. */
export class PlanFailedError extends Error {
  override readonly name = "PlanFailedError";
  /** The HTTP status; absent for a request that never got an answer. */
  readonly status: number | undefined;

  constructor(message: string, status?: number, options?: ErrorOptions) {
    super(message, options);
    this.status = status;
  }

  /** True for a 401 or 403, which asking again will not change. */
  get refused(): boolean {
    return this.status === 401 || this.status === 403;
  }
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
 * A lookup over the route's planner. Bodies are gzipped, and a page with many
 * calls is planned in batches, one request after another, with the readings merged.
 *
 * @throws {PlanUnavailableError} when the route answers 404.
 * @throws {PlanFailedError} when the route refuses, fails, or cannot be reached.
 */
export function routePlan(options: RoutePlanOptions): PlanLookup {
  const url = new URL(`${options.basePath.replace(/\/$/, "")}/mock/plan`, origin(options));

  return async (request, signal) => {
    const plans: MockPlan[] = [];
    for (const part of await splitRequest(request, encodeBody)) {
      const plan = await post(options, url, part, signal);
      if (plan === null) return null;
      plans.push(plan);
    }
    return plans.length === 0 ? null : mergePlans(plans);
  };
}

async function post(
  options: RoutePlanOptions,
  url: URL,
  request: MockPlanRequest,
  signal?: AbortSignal,
): Promise<MockPlan | null> {
  const { bytes, gzip } = await encodeBody(request);
  let response: Response;
  try {
    response = await options.fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        ...(gzip ? { "content-encoding": "gzip" } : {}),
      },
      body: bytes,
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new PlanFailedError("The route could not be reached.", undefined, { cause: error });
  }
  if (response.status === 404) throw new PlanUnavailableError("This route plans nothing.");
  if (!response.ok) {
    const status = response.status;
    throw new PlanFailedError(`The route could not plan: ${String(status)}`, status);
  }
  const body = (await response.json()) as { plan?: MockPlan | null };
  return body.plan ?? null;
}

function origin(options: RoutePlanOptions): string {
  return options.origin ?? (typeof location === "undefined" ? "http://localhost" : location.origin);
}
