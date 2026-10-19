/**
 * A recipe kept by Maple's route, `POST {base}/mock/recipes`, so a link can
 * carry a short id in place of the recipe. A route with no store answers 404.
 */

import type { Recipe } from "@maple-kit/core/mock";

/** Stores a recipe and answers its id, or undefined when no short link can be made. */
export type RecipeShare = (recipe: Recipe, signal?: AbortSignal) => Promise<string | undefined>;

/** Where the route is, and how to reach it past the interceptor. */
export interface RouteRecipesOptions {
  /** Where Maple's route is mounted, such as `/api/maple`. */
  readonly basePath: string;
  /** The real `fetch`, so the request is not itself intercepted. */
  readonly fetch: typeof fetch;
  /** Defaults to the page's own origin. */
  readonly origin?: string;
}

/**
 * A lookup over the route's recipe store. It never throws: a missing store
 * (404), a refusal, a failure or a body that is not an id all answer
 * undefined, and the caller falls back to the inline link.
 */
export function routeRecipes(options: RouteRecipesOptions): RecipeShare {
  const where =
    options.origin ?? (typeof location === "undefined" ? "http://localhost" : location.origin);
  const url = new URL(`${options.basePath.replace(/\/$/, "")}/mock/recipes`, where);

  return async (recipe, signal) => {
    // The sentence is display-only: it is left out of what is sent (undefined drops from JSON).
    try {
      const response = await options.fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...recipe, request: undefined }),
        ...(signal === undefined ? {} : { signal }),
      });
      if (!response.ok) return undefined;
      const body = (await response.json()) as { id?: unknown };
      return typeof body.id === "string" && body.id !== "" ? body.id : undefined;
    } catch {
      return undefined;
    }
  };
}
