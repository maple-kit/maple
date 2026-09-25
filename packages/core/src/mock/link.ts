/**
 * The recipe as a link: `?maple-mock=` carrying it as base64url JSON. It is
 * the recipe's own wire format, so it lives beside the recipe, where the page,
 * the mock runtime and an agent replaying a comment all read it.
 */

import { InvalidRecipeError, parseRecipe } from "./recipe.js";

import type { Recipe } from "./recipe.js";

/** The query parameter a shared link carries the recipe in. */
export const RECIPE_PARAM = "maple-mock";

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
