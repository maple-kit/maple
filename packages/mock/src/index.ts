/**
 * Maple Mock's runtime: the page's API responses, rewritten into a state.
 *
 * Nothing here uses React, Effect or a model. The interceptor is installed
 * from `@maple-kit/mock/install`; this entry is what a box or a test uses to
 * read and write the recipe that interceptor applies. See `docs/mock.md`.
 */

export {
  decodeRecipe,
  encodeRecipe,
  forgetRecipe,
  linkRecipe,
  RECIPE_PARAM,
  RECIPE_STORAGE_KEY,
  readRecipe,
  saveRecipe,
} from "./link.js";

export type { RecipeSources } from "./link.js";
