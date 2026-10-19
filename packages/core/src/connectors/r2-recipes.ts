/**
 * A recipe store that keeps shared mocks in a Cloudflare R2 bucket, through a
 * Worker binding, under the host's own account.
 *
 * Expiry is checked on read from the object's metadata, so a recipe is gone
 * the moment it expires. The bucket keeps the bytes until a lifecycle rule
 * deletes them: add one on the `prefix` to reclaim space, as an optional extra.
 */

import { parseRecipe } from "../mock/recipe.js";
import { isSafeKey, randomId } from "./safe-key.js";

import type { Recipe } from "../mock/recipe.js";
import type { RecipeStore } from "./types.js";

/** What {@link r2Recipes} needs from an R2 bucket binding. */
export interface R2RecipeBucketLike {
  put(
    key: string,
    value: string,
    options?: {
      readonly httpMetadata?: { readonly contentType?: string };
      readonly customMetadata?: Readonly<Record<string, string>>;
    },
  ): Promise<unknown>;
  get(key: string): Promise<{
    text(): Promise<string>;
    readonly customMetadata?: Readonly<Record<string, string>>;
  } | null>;
  delete(key: string): Promise<void>;
}

/** Options for {@link r2Recipes}. */
export interface R2RecipesOptions {
  /** The bucket binding, e.g. `env.MOCKS`. */
  readonly bucket: R2RecipeBucketLike;
  /** Prepended to every object key, so one bucket can serve many previews. */
  readonly prefix?: string;
}

/** Creates a recipe store backed by an R2 bucket. Ids are 128 random bits. */
export function r2Recipes(options: R2RecipesOptions): RecipeStore {
  const { bucket } = options;
  const prefix = options.prefix ?? "";
  const keyOf = (id: string) => `${prefix}recipe-${id}`;

  return {
    async put(recipe, { expiresAt }) {
      const id = randomId();
      await bucket.put(keyOf(id), JSON.stringify(recipe), {
        httpMetadata: { contentType: "application/json" },
        customMetadata: { expiresAt: expiresAt.toISOString() },
      });
      return id;
    },
    async get(id) {
      if (!isSafeKey(id)) return undefined;
      const held = await bucket.get(keyOf(id));
      if (held === null) return undefined;
      if (!isLive(held.customMetadata?.["expiresAt"])) {
        await bucket.delete(keyOf(id)).catch(() => undefined);
        return undefined;
      }
      return readStored(await held.text());
    },
  };
}

/** A recipe with no readable expiry is treated as expired, never as kept forever. */
function isLive(expiresAt: string | undefined): boolean {
  const at = expiresAt === undefined ? Number.NaN : Date.parse(expiresAt);
  return at > Date.now();
}

function readStored(text: string): Recipe | undefined {
  try {
    return parseRecipe(JSON.parse(text));
  } catch {
    return undefined;
  }
}
