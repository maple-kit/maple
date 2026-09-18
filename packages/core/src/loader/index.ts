/**
 * The webpack and Turbopack loader, which is how Next reaches the tagger.
 *
 * Next has no plugin API that can add a transform, and an SWC plugin would be
 * a Rust crate compiled to WebAssembly for a transform that already exists.
 * A loader runs the same Babel plugin both other emitters run.
 */

import { tagSource } from "../tagger/transform.js";

/** The part of a loader's context this uses. */
export interface LoaderContextLike {
  readonly resourcePath: string;
  readonly rootContext?: string;
  async(): (error: Error | undefined, content?: string, map?: unknown) => void;
  getOptions?(): { root?: string };
}

/** Tags a module. Configured from `next.config.ts` on preview builds only. */
export default function mapleLoader(this: LoaderContextLike, source: string): void {
  const done = this.async();
  const root = this.getOptions?.().root ?? this.rootContext;

  tagSource(source, this.resourcePath, root === undefined ? {} : { root }).then(
    (result) => {
      done(undefined, result?.code ?? source, result?.map);
    },
    (error: unknown) => {
      done(error instanceof Error ? error : new Error(String(error)));
    },
  );
}
