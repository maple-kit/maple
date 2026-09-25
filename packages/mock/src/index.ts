/**
 * Maple Mock's runtime: the page's API responses, rewritten into a state.
 *
 * Nothing here uses React, Effect or a model. `@maple-kit/mock/install` is the
 * one-line install; this entry has the same interceptor with options, and the
 * pieces a box or a test uses: the recipe, the inventory, the codecs.
 */

export { createMockClient, installedMock, MockClipboardError } from "./client/index.js";
export type {
  MockCallRow,
  MockClient,
  MockClientOptions,
  MockClientState,
  MockView,
} from "./client/index.js";
export { isData } from "./codec.js";
export type { Answer, Call, Codec } from "./codec.js";
export { installMock } from "./interceptor.js";
export type { InstallOptions, MockHandle } from "./interceptor.js";
export { createInventory, INVENTORY_STORAGE_KEY } from "./inventory.js";
export type { Inventory, InventoryLimits, InventoryOptions, Sample } from "./inventory.js";
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
export { resolve } from "./resolve.js";
export type { ResolveOptions } from "./resolve.js";
export { isJson, pathPattern, restCodec, restKey } from "./rest.js";
export { deflate, inflate, isWrapped, prefixMeta, extractMeta } from "./superjson.js";
export type { TypeMeta } from "./superjson.js";
export { MANY, reshape, reshapeTyped } from "./transform.js";
export type { BodyState } from "./transform.js";
export { trpcCodec } from "./trpc.js";
export type { TrpcCodecOptions } from "./trpc.js";
