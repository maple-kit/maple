/**
 * The shared recipe-store contract.
 *
 * Every recipe store runs this suite. The promises are the ones the route
 * relies on: what was put comes back, ids are never reused, an id nobody was
 * given or one that failed to parse answers undefined, and an expired recipe is
 * gone.
 */

import { describe, expect, it } from "vitest";

import type { RecipeStore } from "../connectors/types.js";
import type { Recipe } from "../mock/recipe.js";

/** What the suite needs in order to exercise a recipe store. */
export interface RecipeContractOptions {
  /** Shown in the test names, e.g. "file". */
  readonly name: string;
  /** Builds an isolated store. Called once per test. */
  create(): Promise<RecipeContractSubject>;
}

/** A store plus whatever is needed to tear it down. */
export interface RecipeContractSubject {
  readonly store: RecipeStore;
  cleanup?(): Promise<void>;
}

const RECIPE: Recipe = {
  version: 2,
  calls: [{ key: "rest:GET /items/:id", state: "empty" }],
  flags: { "new-roaster": true },
};

const DAY = 86_400_000;

async function withSubject(
  options: RecipeContractOptions,
  body: (store: RecipeStore) => Promise<void>,
): Promise<void> {
  const subject = await options.create();
  try {
    await body(subject.store);
  } finally {
    await subject.cleanup?.();
  }
}

/** Runs the recipe-store contract against `options.create()`. */
export function runRecipeContract(options: RecipeContractOptions): void {
  describe(`recipe store contract: ${options.name}`, () => {
    it("gives back what was put", async () => {
      await withSubject(options, async (store) => {
        const id = await store.put(RECIPE, { expiresAt: new Date(Date.now() + DAY) });

        expect(await store.get(id)).toEqual(RECIPE);
      });
    });

    it("gives each put its own id", async () => {
      await withSubject(options, async (store) => {
        const expiresAt = new Date(Date.now() + DAY);
        const first = await store.put(RECIPE, { expiresAt });
        const second = await store.put(RECIPE, { expiresAt });

        expect(first).not.toBe(second);
        expect(first).toMatch(/^[A-Za-z0-9_-]{22,}$/);
      });
    });

    it.each(["never-given", "../other", "a/b", ""])("answers undefined for %j", async (id) => {
      await withSubject(options, async (store) => {
        expect(await store.get(id)).toBeUndefined();
      });
    });

    it("forgets a recipe once it expires", async () => {
      await withSubject(options, async (store) => {
        const id = await store.put(RECIPE, { expiresAt: new Date(Date.now() - 1000) });

        expect(await store.get(id)).toBeUndefined();
      });
    });
  });
}
