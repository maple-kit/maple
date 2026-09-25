/**
 * Where an active recipe lives between reloads: the tab and the URL.
 *
 * Applying a mock reloads the page rather than patching a client cache, so the
 * recipe has to survive the reload. The URL form is what a link shares; the
 * tab form keeps it through client-side navigation that drops the query.
 */

import { InvalidRecipeError, parseRecipe } from "@maple-kit/core/mock";

import type { Recipe } from "@maple-kit/core/mock";

/** The query parameter a shared link carries the recipe in. */
export const RECIPE_PARAM = "maple-mock";

/** The `sessionStorage` key the active recipe is kept under. */
export const RECIPE_STORAGE_KEY = "maple-mock";

/** Encodes a recipe as URL-safe text, validating it on the way out. */
export function encodeRecipe(recipe: Recipe): string {
  const bytes = new TextEncoder().encode(JSON.stringify(parseRecipe(recipe)));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/**
 * Reads text written by {@link encodeRecipe}.
 *
 * @throws {InvalidRecipeError} when the text is not an encoded recipe.
 */
export function decodeRecipe(text: string): Recipe {
  let json: string;
  try {
    const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new InvalidRecipeError(["the text is not an encoded recipe"]);
  }
  return parseRecipe(parseJson(json));
}

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

/** `url` with the recipe set as its query parameter, or removed when undefined. */
export function linkRecipe(url: string | URL, recipe: Recipe | undefined): URL {
  const next = new URL(url);
  if (recipe === undefined) next.searchParams.delete(RECIPE_PARAM);
  else next.searchParams.set(RECIPE_PARAM, encodeRecipe(recipe));
  return next;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new InvalidRecipeError(["the text is not JSON"]);
  }
}
