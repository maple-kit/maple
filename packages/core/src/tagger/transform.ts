/**
 * Running the tagger over one file.
 *
 * Both emitters call this, so the Vite plugin and the Next loader cannot drift
 * into different behaviour. Babel is imported dynamically, so a build that
 * never tags never loads it.
 */

import { mapleTagger } from "./babel.js";

import type { TaggerOptions } from "./babel.js";

/** A transformed file, or nothing when the file was left alone. */
export interface Transformed {
  readonly code: string;
  readonly map?: unknown;
}

const TAGGABLE = /\.[jt]sx$/;

/** True when the tagger has anything to do with this file. */
export function isTaggable(filename: string): boolean {
  return TAGGABLE.test(filename.split("?")[0] ?? filename);
}

/**
 * Tags one file, or returns undefined when it is not JSX, is a dependency, or
 * Babel produced nothing.
 */
export async function tagSource(
  code: string,
  filename: string,
  options: TaggerOptions = {},
): Promise<Transformed | undefined> {
  if (!isTaggable(filename) || filename.includes("node_modules")) return undefined;

  const { transformAsync } = await import("@babel/core");
  const result = await transformAsync(code, {
    filename,
    babelrc: false,
    configFile: false,
    sourceMaps: true,
    parserOpts: { plugins: ["jsx", "typescript"] },
    plugins: [[mapleTagger, options]],
  });

  if (!result?.code) return undefined;
  return { code: result.code, ...(result.map ? { map: result.map } : {}) };
}
