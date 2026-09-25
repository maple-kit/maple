/**
 * Where an active recipe lives between reloads: the tab and the URL.
 *
 * Applying a mock reloads the page rather than patching a client cache, so the
 * recipe has to survive the reload. The URL form is what a link shares; the
 * tab form keeps it through client-side navigation that drops the query.
 */

import { decodeRecipe, InvalidRecipeError, parseRecipe, RECIPE_PARAM } from "@maple-kit/core/mock";

import type { Recipe } from "@maple-kit/core/mock";

/** The `sessionStorage` key the active recipe is kept under. */
export const RECIPE_STORAGE_KEY = "maple-mock";

/** Where {@link readRecipe} looks. */
export interface RecipeSources {
  readonly url: string | URL;
  readonly storage?: Pick<Storage, "getItem">;
}

/**
 * The recipe in force for this page, or undefined when there is none.
 *
 * A link wins over the tab, so opening a shared link shows what was shared
 * even in a tab that had another mock on.
 *
 * @throws {InvalidRecipeError} when the recipe found cannot be read.
 */
export function readRecipe({ storage, url }: RecipeSources): Recipe | undefined {
  const linked = new URL(url).searchParams.get(RECIPE_PARAM);
  if (linked !== null) return decodeRecipe(linked);
  const stored = storage?.getItem(RECIPE_STORAGE_KEY);
  return stored == null ? undefined : parseRecipe(parseJson(stored));
}

/** Keeps `recipe` for the tab. */
export function saveRecipe(storage: Pick<Storage, "setItem">, recipe: Recipe): void {
  storage.setItem(RECIPE_STORAGE_KEY, JSON.stringify(parseRecipe(recipe)));
}

/** Forgets the tab's recipe. A link still carrying one is the caller's to drop. */
export function forgetRecipe(storage: Pick<Storage, "removeItem">): void {
  storage.removeItem(RECIPE_STORAGE_KEY);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new InvalidRecipeError(["the text is not JSON"]);
  }
}
