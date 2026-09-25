/**
 * The example's feature flags, evaluated on the server through OpenFeature.
 *
 * On a preview build and `next dev` the provider is wrapped by Maple Mock, and
 * the recipe comes from the request: its `?maple-mock=` link, else the cookie
 * the page keeps. Everywhere else the provider is used as it is and no request
 * is read. `MAPLE_MOCK` is inlined at build time, so production drops the rest.
 */

import { AsyncLocalStorage } from "node:async_hooks";

import { withMockFlags } from "@maple-kit/mock/openfeature";
import { requestRecipe } from "@maple-kit/mock/server";
import { OpenFeature, TypedInMemoryProvider } from "@openfeature/server-sdk";

import type { Recipe } from "@maple-kit/core/mock";
import type { RecipeRequest } from "@maple-kit/mock/server";

const FLAGS = {
  "launch-week": {
    variants: { on: true, off: false },
    defaultVariant: "off" as const,
    disabled: false,
  },
};

const preview = process.env.MAPLE_MOCK === "1";

/** The recipe of the request being rendered, for a provider shared by every request. */
const rendering = new AsyncLocalStorage<Recipe | undefined>();

const provider = new TypedInMemoryProvider(FLAGS);
await OpenFeature.setProviderAndWait(
  preview ? withMockFlags(provider, { recipe: () => rendering.getStore() }) : provider,
);

/** A boolean flag for this request, under its mock on a preview. */
export async function serverFlag(
  key: string,
  fallback: boolean,
  request: () => Promise<RecipeRequest>,
): Promise<boolean> {
  const client = OpenFeature.getClient();
  if (!preview) return client.getBooleanValue(key, fallback);
  const recipe = requestRecipe(await request());
  return rendering.run(recipe, () => client.getBooleanValue(key, fallback));
}
