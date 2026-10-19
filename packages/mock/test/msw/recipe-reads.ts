/**
 * A fake of Maple's `GET {base}/mock/recipes/{id}`, recording what was asked.
 * It answers a stored recipe, a status, or nothing at all.
 */

import { http, HttpResponse } from "msw";

import type { Recipe } from "@maple-kit/core/mock";
import type { RequestHandler } from "msw";

export const RECIPES_BASE = "/api/maple";

export interface RecipeReadsFake {
  readonly handlers: RequestHandler[];
  /** The ids asked for, oldest first. */
  readonly asked: string[];
  store(id: string, recipe: Recipe): void;
  /** The next answer is this status, with a JSON error body. */
  refuseNext(status: number): void;
  /** The next request never gets an answer. */
  stallNext(): void;
  reset(): void;
}

export function createRecipeReadsFake(): RecipeReadsFake {
  const asked: string[] = [];
  const stored = new Map<string, Recipe>();
  let refusal: number | undefined;
  let stall = false;

  const handlers = [
    http.get(`*${RECIPES_BASE}/mock/recipes/:id`, async ({ params }) => {
      asked.push(String(params["id"]));
      if (stall) {
        stall = false;
        return new Promise<never>(() => undefined);
      }
      if (refusal !== undefined) {
        const status = refusal;
        refusal = undefined;
        return HttpResponse.json({ error: "refused" }, { status });
      }
      const recipe = stored.get(String(params["id"]));
      return recipe === undefined
        ? HttpResponse.json({ error: "not found" }, { status: 404 })
        : HttpResponse.json(recipe);
    }),
  ];

  return {
    handlers,
    asked,
    store(id, recipe) {
      stored.set(id, recipe);
    },
    refuseNext(status) {
      refusal = status;
    },
    stallNext() {
      stall = true;
    },
    reset() {
      asked.length = 0;
      stored.clear();
      refusal = undefined;
      stall = false;
    },
  };
}
