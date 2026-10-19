/**
 * A recipe store that keeps everything in a Map, for route tests and as the
 * smallest thing that satisfies the contract. Not for production.
 */

import { isSafeKey, randomId } from "../connectors/safe-key.js";

import type { RecipeStore } from "../connectors/types.js";
import type { Recipe } from "../mock/recipe.js";

/** Creates an in-memory recipe store. */
export function memoryRecipes(): RecipeStore {
  const held = new Map<string, { recipe: Recipe; expiresAt: number }>();
  return {
    put(recipe, { expiresAt }) {
      const id = randomId();
      held.set(id, { recipe, expiresAt: expiresAt.getTime() });
      return Promise.resolve(id);
    },
    get(id) {
      const found = isSafeKey(id) ? held.get(id) : undefined;
      const live = found !== undefined && found.expiresAt > Date.now();
      return Promise.resolve(live ? found.recipe : undefined);
    },
  };
}
