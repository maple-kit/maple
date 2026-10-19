/**
 * Where an active recipe lives between reloads: the tab and the URL.
 *
 * Applying a mock reloads the page rather than patching a client cache, so the
 * recipe has to survive the reload. The URL form is what a link shares; the
 * tab form keeps it through client-side navigation that drops the query.
 */

import {
  decodeRecipe,
  InvalidRecipeError,
  parseRecipe,
  RECIPE_ID_PARAM,
  RECIPE_PARAM,
  recipeCookie,
} from "@maple-kit/core/mock";

import type { Recipe } from "@maple-kit/core/mock";

/** The `sessionStorage` key the active recipe is kept under. */
export const RECIPE_STORAGE_KEY = "maple-mock";

/** Where {@link readRecipe} looks. */
export interface RecipeSources {
  readonly url: string | URL;
  readonly storage?: Pick<Storage, "getItem">;
}

/**
 * What {@link readRecipe} found: nothing, a recipe, or the id of one the route
 * still has to hand over.
 */
export type RecipeReading =
  | { readonly kind: "none" }
  | { readonly kind: "found"; readonly recipe: Recipe }
  | { readonly kind: "pending"; readonly id: string };

/**
 * The recipe in force for this page.
 *
 * A link wins over the tab, so opening a shared link shows what was shared
 * even in a tab that had another mock on. A short link names a stored recipe
 * and is pending until `fetchRecipe` has it.
 *
 * @throws {InvalidRecipeError} when the recipe found cannot be read.
 */
export function readRecipe({ storage, url }: RecipeSources): RecipeReading {
  const { searchParams } = new URL(url);
  const id = searchParams.get(RECIPE_ID_PARAM);
  if (id !== null && id !== "") return { kind: "pending", id };
  const linked = searchParams.get(RECIPE_PARAM);
  if (linked !== null) return { kind: "found", recipe: decodeRecipe(linked) };
  const stored = storage?.getItem(RECIPE_STORAGE_KEY);
  if (stored == null) return { kind: "none" };
  return { kind: "found", recipe: parseRecipe(parseJson(stored)) };
}

/** Keeps `recipe` for the tab. */
export function saveRecipe(storage: Pick<Storage, "setItem">, recipe: Recipe): void {
  storage.setItem(RECIPE_STORAGE_KEY, JSON.stringify(parseRecipe(recipe)));
}

/** Forgets the tab's recipe. A link still carrying one is the caller's to drop. */
export function forgetRecipe(storage: Pick<Storage, "removeItem">): void {
  storage.removeItem(RECIPE_STORAGE_KEY);
}

/**
 * Keeps the recipe's server layers in the cookie a server reads, or clears it.
 * False when they would not fit, and the cookie is cleared instead. Only a
 * page that installed the interceptor, a preview's, ever calls this.
 */
export function keepRecipeCookie(
  view: { document?: Pick<Document, "cookie">; location: Pick<Location, "protocol"> } | undefined,
  recipe: Recipe | undefined,
): boolean {
  if (view?.document === undefined) return true;
  const secure = view.location.protocol === "https:";
  const cookie = recipeCookie(recipe, secure);
  view.document.cookie = cookie ?? recipeCookie(undefined, secure) ?? "";
  return cookie !== undefined;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new InvalidRecipeError(["the text is not JSON"]);
  }
}
