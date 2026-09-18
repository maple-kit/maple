/**
 * The Vite plugin.
 *
 * Vite is the easy target: one plugin and nothing else. The plugin's shape is
 * described structurally rather than imported, so `@maple-kit/core` does not
 * take a dependency on Vite to type a five-field object.
 */

import { createMapleHandler, DEFAULT_BASE_PATH } from "../route/handler.js";
import { toNodeMiddleware } from "../route/node.js";
import { isTaggable, tagSource } from "../tagger/transform.js";

import type { RouteOptions } from "../route/handler.js";
import type { NodeMiddleware } from "../route/node.js";

/** The part of a Vite server this plugin touches. */
export interface ViteServerLike {
  readonly middlewares: { use(middleware: NodeMiddleware): unknown };
}

/** The part of Vite's plugin interface this uses. */
export interface VitePluginLike {
  readonly name: string;
  readonly enforce?: "post" | "pre";
  transform?(code: string, id: string): Promise<{ code: string; map?: unknown } | undefined>;
  configureServer?(server: ViteServerLike): void;
  configurePreviewServer?(server: ViteServerLike): void;
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
  /**
   * Mounts the SDK route on the dev and preview servers. A statically deployed
   * site has no server, and has to host the route elsewhere.
   */
  readonly route?: RouteOptions;
}

/** Mounts Maple into a Vite build. */
export function maple(options: MapleViteOptions = {}): VitePluginLike {
  const tagger = options.tagger ?? false;

  const mount = options.route === undefined ? undefined : middlewareFor(options.route);

  return {
    name: "maple",
    enforce: "pre",
    async transform(code: string, id: string) {
      if (!tagger || !isTaggable(id)) return undefined;
      return tagSource(code, id.split("?")[0] ?? id, root(options));
    },
    ...(mount === undefined
      ? {}
      : {
          configureServer: (server: ViteServerLike) => void server.middlewares.use(mount),
          configurePreviewServer: (server: ViteServerLike) => void server.middlewares.use(mount),
        }),
  };
}

function middlewareFor(route: RouteOptions): NodeMiddleware {
  return toNodeMiddleware(createMapleHandler(route), route.basePath ?? DEFAULT_BASE_PATH);
}

function root(options: MapleViteOptions): { root?: string } {
  return options.root === undefined ? {} : { root: options.root };
}
