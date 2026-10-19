import { rm } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { r2Recipes } from "../src/connectors/r2-recipes.js";
import { fileRecipes } from "../src/local/file-recipes.js";
import { memoryRecipes } from "../src/testing/memory-recipes.js";
import { runRecipeContract } from "../src/testing/recipe-contract.js";
import { scratch } from "./local-repo.js";

import type { R2RecipeBucketLike } from "../src/connectors/r2-recipes.js";
import type { RecipeStore } from "../src/connectors/types.js";
import type { Recipe } from "../src/mock/recipe.js";

interface Held {
  readonly text: string;
  readonly customMetadata: Readonly<Record<string, string>> | undefined;
}

/** A bucket in a Map, with the shape of an R2 binding. */
function fakeBucket(): R2RecipeBucketLike & { readonly objects: Map<string, Held> } {
  const objects = new Map<string, Held>();
  return {
    objects,
    put(key, value, options) {
      objects.set(key, { text: value, customMetadata: options?.customMetadata });
      return Promise.resolve(null);
    },
    get(key) {
      const held = objects.get(key);
      if (held === undefined) return Promise.resolve(null);
      return Promise.resolve({
        text: () => Promise.resolve(held.text),
        ...(held.customMetadata === undefined ? {} : { customMetadata: held.customMetadata }),
      });
    },
    delete(key) {
      objects.delete(key);
      return Promise.resolve();
    },
  };
}

function isolated(): { store: RecipeStore; cleanup: () => Promise<void> } {
  const made = scratch();
  return {
    store: fileRecipes({ cwd: made.dir, url: "localhost:3000" }),
    cleanup: () => rm(made.dir, { recursive: true, force: true }),
  };
}

runRecipeContract({ name: "memory", create: () => Promise.resolve({ store: memoryRecipes() }) });
runRecipeContract({
  name: "r2",
  create: () => Promise.resolve({ store: r2Recipes({ bucket: fakeBucket() }) }),
});
runRecipeContract({ name: "file", create: () => Promise.resolve(isolated()) });

const RECIPE: Recipe = { version: 2, calls: [{ key: "trpc:orders.list", state: "empty" }] };
const LATER = () => ({ expiresAt: new Date(Date.now() + 60_000) });

describe("r2Recipes", () => {
  it("stores under the prefix and records the expiry on the object", async () => {
    const bucket = fakeBucket();
    const id = await r2Recipes({ bucket, prefix: "pr-7/" }).put(RECIPE, {
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    });

    expect([...bucket.objects.keys()]).toEqual([`pr-7/recipe-${id}`]);
    expect(bucket.objects.get(`pr-7/recipe-${id}`)?.customMetadata).toEqual({
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
  });

  it("never reads another prefix's object", async () => {
    const bucket = fakeBucket();
    const id = await r2Recipes({ bucket, prefix: "pr-1/" }).put(RECIPE, LATER());

    expect(await r2Recipes({ bucket, prefix: "pr-2/" }).get(id)).toBeUndefined();
  });

  it("treats an object with no readable expiry as expired and removes it", async () => {
    const bucket = fakeBucket();
    bucket.objects.set("recipe-abc", { text: JSON.stringify(RECIPE), customMetadata: {} });

    expect(await r2Recipes({ bucket }).get("abc")).toBeUndefined();
    expect(bucket.objects.size).toBe(0);
  });

  it("answers undefined for stored text that is not a recipe", async () => {
    const bucket = fakeBucket();
    const customMetadata = { expiresAt: new Date(Date.now() + 60_000).toISOString() };
    bucket.objects.set("recipe-abc", { text: "{not json", customMetadata });

    expect(await r2Recipes({ bucket }).get("abc")).toBeUndefined();
  });

  it("lets a refusal from the bucket reach the caller, without the recipe in it", async () => {
    const bucket: R2RecipeBucketLike = {
      ...fakeBucket(),
      put: () => Promise.reject(new Error("bucket unavailable (503)")),
    };

    await expect(r2Recipes({ bucket }).put(RECIPE, LATER())).rejects.toThrow(
      "bucket unavailable (503)",
    );
  });
});

describe("recipe ids", () => {
  /** The file store asks git where it is on every call, so it is counted in fewer puts. */
  const stores: [string, () => RecipeStore, number][] = [
    ["memory", () => memoryRecipes(), 1000],
    ["r2", () => r2Recipes({ bucket: fakeBucket() }), 1000],
    ["file", () => isolated().store, 100],
  ];

  it.each(stores)(
    "%s: repeated puts of one recipe give distinct ids",
    async (_, create, count) => {
      const store = create();
      const ids = new Set<string>();
      for (let i = 0; i < count; i += 1) ids.add(await store.put(RECIPE, LATER()));

      expect(ids.size).toBe(count);
      for (const id of ids) expect(id).toMatch(/^[0-9a-f]{32}$/);
    },
    60_000,
  );
});
