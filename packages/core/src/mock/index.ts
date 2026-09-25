/**
 * The contract `@maple-kit/mock` and the comment fence share.
 *
 * The recipe and a call's shape live here: the route serves shapes and the
 * page reads them. The interceptor, the codecs and the transforms are in
 * `@maple-kit/mock`, which a host installs only when it mocks.
 */

export { InvalidRecipeError, MOCK_STATES, parseRecipe, RECIPE_VERSION } from "./recipe.js";

export type { MockCall, MockState, Recipe } from "./recipe.js";
export { createShapeIndex, isShape, SHAPE_SOURCES } from "./shape.js";
export type { JsonSchema, SchemaDocument, Shape, ShapeIndex, ShapeSource } from "./shape.js";
