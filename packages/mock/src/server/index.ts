/**
 * The recipe on the server, for flags and `as` evaluated there: read from a
 * request's `?maple-mock=` link, else from the cookie the page keeps. It is
 * opt-in, from the host's own session loader, and loads no MSW.
 */

import { decodeRecipe, readRecipeCookie, RECIPE_PARAM } from "@maple-kit/core/mock";

import type { Recipe } from "@maple-kit/core/mock";

/** A request, as a server framework hands one over. */
export interface RecipeRequest {
  readonly url: string;
  readonly headers: Headers | Readonly<Record<string, string | readonly string[] | undefined>>;
}

/**
 * The recipe a request carries, or undefined when it carries none or one that
 * cannot be read. The recipe's `route` is not checked here: an API call made
 * for a page has the API's path, not the page's.
 */
export function requestRecipe(request: RecipeRequest): Recipe | undefined {
  try {
    const linked = new URL(request.url, "http://localhost").searchParams.get(RECIPE_PARAM);
    if (linked !== null) return decodeRecipe(linked);
    return readRecipeCookie(cookieOf(request.headers));
  } catch {
    return undefined;
  }
}

function cookieOf(headers: RecipeRequest["headers"]): string | undefined {
  if (headers instanceof Headers) return headers.get("cookie") ?? undefined;
  const value = headers["cookie"];
  return Array.isArray(value) ? value.join("; ") : (value as string | undefined);
}
