/**
 * Preview environments: which session a deployment is serving.
 *
 * `identify` reads a request and `matches` is the optional escape hatch for a
 * key that is not a branch name. mirrord is the first preset.
 */

export { mirrord } from "./mirrord.js";
export type { MirrordOptions } from "./mirrord.js";
export type {
  PreviewEnvironment,
  PreviewIdentity,
  PreviewRequest,
  PreviewSource,
} from "./types.js";
