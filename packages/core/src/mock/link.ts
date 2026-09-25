/**
 * The recipe as a link: `?maple-mock=` carrying it as base64url JSON. It is
 * the recipe's own wire format, so it lives beside the recipe, where the page,
 * the mock runtime and an agent replaying a comment all read it.
 */

import { InvalidRecipeError, parseRecipe, RECIPE_VERSION } from "./recipe.js";

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

/** The cookie a server reads the recipe from, for flags and `as` evaluated there. */
export const RECIPE_COOKIE = "maple-mock";

/** The longest cookie this writes: browsers drop one over 4096 bytes without a word. */
export const RECIPE_COOKIE_LIMIT = 4096;

/**
 * A `document.cookie` assignment carrying the layers a server evaluates:
 * `flags`, `as` and `route`, never `calls`, which only the page answers. It
 * clears the cookie when there is no such layer, and is undefined when the
 * layers would not fit. `secure` adds `Secure`, for HTTPS.
 */
export function recipeCookie(recipe: Recipe | undefined, secure: boolean): string | undefined {
  const attributes = `Path=/; SameSite=Lax${secure ? "; Secure" : ""}`;
  const layers = recipe === undefined ? undefined : serverLayers(recipe);
  if (layers === undefined) return `${RECIPE_COOKIE}=; Max-Age=0; ${attributes}`;
  const cookie = `${RECIPE_COOKIE}=${encodeRecipe(layers)}; ${attributes}`;
  return cookie.length > RECIPE_COOKIE_LIMIT ? undefined : cookie;
}

/**
 * The recipe in a `Cookie` header, or undefined when it carries none.
 *
 * @throws {InvalidRecipeError} when the cookie is there but cannot be read.
 */
export function readRecipeCookie(header: string | null | undefined): Recipe | undefined {
  for (const pair of (header ?? "").split(";")) {
    const [name, ...value] = pair.trim().split("=");
    if (name === RECIPE_COOKIE && value.join("=") !== "") return decodeRecipe(value.join("="));
  }
  return undefined;
}

function serverLayers({ flags, as, route }: Recipe): Recipe | undefined {
  if (flags === undefined && as === undefined) return undefined;
  return {
    version: RECIPE_VERSION,
    calls: [],
    ...(flags === undefined ? {} : { flags }),
    ...(as === undefined ? {} : { as }),
    ...(route === undefined ? {} : { route }),
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new InvalidRecipeError(["the text is not JSON"]);
  }
}
