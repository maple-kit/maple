/**
 * The contract `@maple-kit/mock` and the comment fence share.
 *
 * Only the recipe lives here. The interceptor, the codecs and the transforms
 * are in `@maple-kit/mock`, which a host installs only when it mocks.
 */

export { InvalidRecipeError, MOCK_STATES, parseRecipe, RECIPE_VERSION } from "./recipe.js";

export type { MockCall, MockState, Recipe } from "./recipe.js";
