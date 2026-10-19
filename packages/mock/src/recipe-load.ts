/**
 * A recipe a short link names, fetched from Maple's route before the page's
 * own requests are let through. See `docs/mock.md`.
 */

import { parseRecipe } from "@maple-kit/core/mock";

import type { Recipe } from "@maple-kit/core/mock";

/** How long matched requests are held for the route's answer before they pass through. */
export const RECIPE_LOAD_TIMEOUT_MS = 3000;

/** Raised when a short link's recipe could not be had. Never carries the id or the body. */
export class RecipeLoadError extends Error {
  override readonly name = "RecipeLoadError";
  /** The HTTP status; absent when nothing answered. */
  readonly status: number | undefined;

  constructor(message: string, status?: number, options?: ErrorOptions) {
    super(message, options);
    this.status = status;
  }
}

/** Where the route is, and how to reach it past the interceptor. */
export interface FetchRecipeOptions {
  /** Where Maple's route is mounted, such as `/api/maple`. */
  readonly basePath: string;
  readonly id: string;
  /** The real `fetch`, so the request is not itself intercepted. */
  readonly fetch: typeof fetch;
  readonly signal?: AbortSignal;
  /** Defaults to the page's own origin. */
  readonly origin?: string;
}

/**
 * The stored recipe, `GET {base}/mock/recipes/{id}`.
 *
 * @throws {RecipeLoadError} when the route has none, refuses, fails, or sends something else.
 */
export async function fetchRecipe(options: FetchRecipeOptions): Promise<Recipe> {
  const where =
    options.origin ?? (typeof location === "undefined" ? "http://localhost" : location.origin);
  const path = `${options.basePath.replace(/\/$/, "")}/mock/recipes/${encodeURIComponent(options.id)}`;
  let response: Response;
  try {
    response = await options.fetch(new URL(path, where), {
      credentials: "same-origin",
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  } catch (error) {
    throw new RecipeLoadError("The route could not be reached.", undefined, { cause: error });
  }
  if (!response.ok) {
    const { status } = response;
    throw new RecipeLoadError(`The route has no such mock: ${String(status)}`, status);
  }
  try {
    return parseRecipe(await response.json());
  } catch (error) {
    throw new RecipeLoadError("The route sent something that is not a mock.", undefined, {
      cause: error,
    });
  }
}

/** Where a short link's load stands. */
export type RecipeLoadStatus = "loading" | "loaded" | "failed";

/** A short link's load, as the box and the interceptor see it. */
export interface RecipeLink {
  status(): RecipeLoadStatus;
  /** Called once when the load settles. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Settles, never rejects, when the load has succeeded, failed or timed out. */
  readonly settled: Promise<void>;
}

/** What {@link startRecipeLoad} does once the route answers. */
export interface RecipeLoadOptions {
  readonly load: (signal: AbortSignal) => Promise<Recipe>;
  readonly onLoaded: (recipe: Recipe) => void;
  readonly onFailed: (error: unknown) => void;
  readonly timeoutMs?: number;
}

/** Starts the load now, with a cap on the wait. */
export function startRecipeLoad(options: RecipeLoadOptions): RecipeLink {
  let status: RecipeLoadStatus = "loading";
  const listeners = new Set<() => void>();
  const abort = new AbortController();
  const timer = setTimeout(() => {
    abort.abort();
  }, options.timeoutMs ?? RECIPE_LOAD_TIMEOUT_MS);

  const late = new Promise<never>((_, reject) => {
    abort.signal.addEventListener("abort", () => {
      reject(new RecipeLoadError("The route took too long."));
    });
  });
  const settled = Promise.race([options.load(abort.signal), late])
    .then(
      (recipe) => {
        status = "loaded";
        options.onLoaded(recipe);
      },
      (error: unknown) => {
        status = "failed";
        options.onFailed(error);
      },
    )
    .finally(() => {
      clearTimeout(timer);
      for (const listener of [...listeners]) listener();
    });

  return {
    status: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    settled,
  };
}
