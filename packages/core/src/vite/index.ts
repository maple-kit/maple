/**
 * The Vite plugin.
 *
 * Vite is the easy target: one plugin and nothing else. The plugin's shape is
 * described structurally rather than imported, so `@maple-kit/core` does not
 * take a dependency on Vite to type a five-field object.
 */

import { isTaggable, tagSource } from "../tagger/transform.js";

/** The part of Vite's plugin interface this uses. */
export interface VitePluginLike {
  readonly name: string;
  readonly enforce?: "post" | "pre";
  transform?(code: string, id: string): Promise<{ code: string; map?: unknown } | undefined>;
}

/** How the plugin behaves. */
export interface MapleViteOptions {
  /**
   * Whether to emit `data-maple-src` and `data-maple-name`. Defaults to false,
   * so a production build is correct when the flag is forgotten.
   */
  readonly tagger?: boolean;
  /** Directory emitted paths are relative to. Defaults to the working directory. */
  readonly root?: string;
}

/** Mounts Maple into a Vite build. */
export function maple(options: MapleViteOptions = {}): VitePluginLike {
  const tagger = options.tagger ?? false;

  return {
    name: "maple",
    enforce: "pre",
    async transform(code: string, id: string) {
      if (!tagger || !isTaggable(id)) return undefined;
      return tagSource(code, id.split("?")[0] ?? id, root(options));
    },
  };
}

function root(options: MapleViteOptions): { root?: string } {
  return options.root === undefined ? {} : { root: options.root };
}
