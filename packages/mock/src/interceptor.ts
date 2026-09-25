/**
 * The in-page transport: `fetch` and `XMLHttpRequest`, wrapped in the page.
 *
 * Built on `@mswjs/interceptors`, the worker-free layer MSW itself uses, so
 * nothing is served from the host's origin and its CSP is unchanged. It reads
 * the recipe once: applying a mock reloads the page. See `docs/mock.md`.
 */

import { BatchInterceptor } from "@mswjs/interceptors";
import { FetchInterceptor } from "@mswjs/interceptors/fetch";
import { XMLHttpRequestInterceptor } from "@mswjs/interceptors/XMLHttpRequest";

import { createInventory } from "./inventory.js";
import { forgetRecipe, readRecipe, saveRecipe } from "./link.js";
import { record, resolve, splitRequest } from "./resolve.js";
import { pathPattern, restCodec } from "./rest.js";
import { trpcCodec } from "./trpc.js";

import type { Codec } from "./codec.js";
import type { Inventory } from "./inventory.js";
import type { Logger } from "@maple-kit/core/logger";
import type { Recipe } from "@maple-kit/core/mock";

/** How {@link installMock} runs. Every field has a working default. */
export interface InstallOptions {
  /** Requests never recorded or mocked, such as Maple's own route. */
  readonly ignore?: (url: URL) => boolean;
  /** Where a malformed recipe is reported. Silent when absent. */
  readonly logger?: Logger;
  /** The tab's storage. Defaults to `sessionStorage` when there is one. */
  readonly storage?: Storage;
  /** Tried in order. Defaults to tRPC at `/api/trpc`, then REST. */
  readonly codecs?: readonly Codec[];
  /** The real `fetch` a mocked request is forwarded through. */
  readonly fetch?: typeof fetch;
}

/** The installed transport. */
export interface MockHandle {
  /** The recipe in force, read once at install. */
  readonly recipe: Recipe | undefined;
  readonly inventory: Inventory;
  /** Restores `fetch` and `XMLHttpRequest`. */
  dispose(): void;
}

const INSTALLED = Symbol.for("@maple-kit/mock.installed");
const CODECS: readonly Codec[] = [trpcCodec(), restCodec];

type Installed = typeof globalThis & { [INSTALLED]?: MockHandle };

/**
 * Wraps `fetch` and `XMLHttpRequest` and applies the active recipe. A second
 * call returns the first handle rather than wrapping twice.
 */
export function installMock(options: InstallOptions = {}): MockHandle {
  const global = globalThis as Installed;
  const existing = global[INSTALLED];
  if (existing !== undefined) return existing;

  const storage = options.storage ?? tabStorage();
  const recipe = activeRecipe(storage, options.logger);
  const inventory = createInventory(storage === undefined ? {} : { storage });
  const forward = options.fetch ?? globalThis.fetch.bind(globalThis);
  const ignored = (url: string) => options.ignore?.(new URL(url)) ?? false;
  const route = () => pathPattern(pageUrl()?.pathname ?? "/");

  const interceptor = new BatchInterceptor({
    name: "maple-mock",
    interceptors: [new FetchInterceptor(), new XMLHttpRequestInterceptor()],
  });
  const codecs = options.codecs ?? CODECS;
  interceptor.on(
    "request",
    awaited(async ({ controller, request }) => {
      if (ignored(request.url)) return;
      const response = await resolve(request, recipe, inventory, {
        codecs,
        forward,
        route: route(),
      });
      if (response !== undefined) controller.respondWith(response);
    }),
  );
  // Not awaited: the interceptor holds the page's response until a listener
  // settles, and reading a streamed batch to its end would hold it that long.
  interceptor.on("response", ({ isMockedResponse, request, response }) => {
    if (isMockedResponse || ignored(request.url)) return;
    const at = route();
    remember(request, response, codecs).then(
      (found) => found && record(inventory, found.calls, found.answers, { route: at }),
      (error: unknown) =>
        options.logger?.debug("Could not record a response.", { error: String(error) }),
    );
  });
  interceptor.apply();

  const handle: MockHandle = {
    recipe,
    inventory,
    dispose() {
      interceptor.dispose();
      delete global[INSTALLED];
    },
  };
  global[INSTALLED] = handle;
  return handle;
}

/** A passthrough response, read into the answers worth recording. */
async function remember(request: Request, response: Response, codecs: readonly Codec[]) {
  const split = await splitRequest(request, undefined, codecs);
  if (split === undefined) return undefined;
  const answers = await split.codec.read(response, split.calls);
  return { calls: split.calls, answers };
}

/** The recipe to apply. A linked one is kept for the tab; a broken one is dropped. */
function activeRecipe(storage: Storage | undefined, logger?: Logger): Recipe | undefined {
  const url = pageUrl();
  if (url === undefined) return undefined;
  try {
    const recipe = readRecipe({ url, ...(storage === undefined ? {} : { storage }) });
    if (recipe !== undefined && storage !== undefined) saveRecipe(storage, recipe);
    return recipe;
  } catch (error) {
    if (storage !== undefined) forgetRecipe(storage);
    logger?.warn("Ignoring a mock recipe that could not be read.", { error: String(error) });
    return undefined;
  }
}

/**
 * An async listener, typed as the interceptor declares it. The interceptor
 * awaits whatever a listener returns before it settles the request.
 */
function awaited<A extends unknown[]>(listener: (...args: A) => Promise<void>) {
  return listener as (...args: A) => void;
}

function pageUrl(): URL | undefined {
  return typeof location === "undefined" ? undefined : new URL(location.href);
}

function tabStorage(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
}
