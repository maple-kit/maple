/**
 * A recipe store that keeps shared mocks as files in
 * `.maple/<branch>/mock/<id>.json`, for a laptop.
 *
 * The expiry is written beside the recipe and checked on read; an expired file
 * is removed when it is found.
 */

import { unlink } from "node:fs/promises";
import { join } from "node:path";

import { isSafeKey, randomId } from "../connectors/safe-key.js";
import { parseRecipe } from "../mock/recipe.js";
import { readIfPresent, writeAtomic } from "./local-files.js";
import { resolveLocalPlace } from "./local-place.js";

import type { RecipeStore } from "../connectors/types.js";
import type { Recipe } from "../mock/recipe.js";
import type { LocalPlaceOptions } from "./local-place.js";

/** Options for {@link fileRecipes}. */
export type FileRecipesOptions = LocalPlaceOptions;

/** Creates a recipe store backed by JSON files under `.maple/`. */
export function fileRecipes(options: FileRecipesOptions = {}): RecipeStore {
  async function pathOf(id: string): Promise<string> {
    return join((await resolveLocalPlace(options)).dir, "mock", `${id}.json`);
  }

  return {
    async put(recipe, { expiresAt }) {
      const id = randomId();
      const body = { expiresAt: expiresAt.toISOString(), recipe };
      await writeAtomic(await pathOf(id), JSON.stringify(body));
      return id;
    },
    async get(id) {
      if (!isSafeKey(id)) return undefined;
      const path = await pathOf(id);
      const text = await readIfPresent(path);
      if (text === undefined) return undefined;
      const held = readHeld(text);
      if (held === undefined) return undefined;
      if (held.expiresAt <= Date.now()) {
        await unlink(path).catch(() => undefined);
        return undefined;
      }
      return held.recipe;
    },
  };
}

function readHeld(text: string): { expiresAt: number; recipe: Recipe } | undefined {
  try {
    const parsed = JSON.parse(text) as { expiresAt?: unknown; recipe?: unknown };
    const expiresAt = typeof parsed.expiresAt === "string" ? Date.parse(parsed.expiresAt) : NaN;
    if (Number.isNaN(expiresAt)) return undefined;
    return { expiresAt, recipe: parseRecipe(parsed.recipe) };
  } catch {
    return undefined;
  }
}
