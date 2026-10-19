/**
 * `POST {base}/mock/recipes` and `GET {base}/mock/recipes/{id}`: a mock kept
 * behind a short id, so a link does not have to carry the recipe.
 *
 * What is stored is the recipe's layers and never the reviewer's words: the
 * `request` field is dropped. A refusal says what is wrong, never what was sent.
 */

import { isSafeKey } from "../connectors/safe-key.js";
import { InvalidRecipeError, parseRecipe } from "../mock/recipe.js";

import type { RecipeStore } from "../connectors/types.js";
import type { Recipe } from "../mock/recipe.js";

/** The largest recipe body accepted, checked before it is parsed. */
export const RECIPE_MAX_BYTES = 16 * 1024;

/** How long a stored recipe lives when the host does not say. */
export const RECIPE_DEFAULT_TTL_DAYS = 30;

const DAY_MS = 86_400_000;

type Answer = (body: unknown, status: number) => Response;

/** The days a recipe is kept: the host's number when it is a positive one. */
export function recipeTtlDays(configured: number | undefined): number {
  const usable = configured !== undefined && Number.isFinite(configured) && configured > 0;
  return usable ? configured : RECIPE_DEFAULT_TTL_DAYS;
}

/** Stores the recipe in the request body, or answers why it will not. */
export async function storeRecipe(
  store: RecipeStore,
  ttlDays: number,
  request: Request,
  answer: Answer,
): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > RECIPE_MAX_BYTES) return answer({ error: "Too large" }, 413);

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > RECIPE_MAX_BYTES) {
    return answer({ error: "Too large" }, 413);
  }
  const recipe = readRecipe(text);
  if (recipe === undefined) return answer({ error: "Not a recipe" }, 400);

  const expiresAt = new Date(Date.now() + ttlDays * DAY_MS);
  return answer({ id: await store.put(withoutRequest(recipe), { expiresAt }) }, 200);
}

/** The stored recipe, or a 404 for an id that is malformed, unknown or expired. */
export async function loadRecipe(
  store: RecipeStore,
  id: string,
  answer: Answer,
): Promise<Response> {
  const recipe = isSafeKey(id) ? await store.get(id) : undefined;
  return recipe === undefined ? answer({ error: "Not found" }, 404) : answer(recipe, 200);
}

function readRecipe(text: string): Recipe | undefined {
  try {
    return parseRecipe(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof InvalidRecipeError) return undefined;
    throw error;
  }
}

/** The reviewer's free text is display-only, and the one field that can hold anything. */
function withoutRequest(recipe: Recipe): Recipe {
  const copy = { ...recipe };
  delete copy.request;
  return copy;
}
