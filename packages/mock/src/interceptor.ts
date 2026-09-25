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

import { installedMock, keepInstalled } from "./handle.js";
import { createInventory } from "./inventory.js";
import { forgetRecipe, readRecipe, saveRecipe } from "./link.js";
import { record, resolve, splitRequest } from "./resolve.js";
import { isJson, pathPattern, restCodec } from "./rest.js";
import { routePlan } from "./schema/plan.js";
import { routeShapes } from "./schema/route.js";
import { trpcCodec } from "./trpc.js";

import type { Codec } from "./codec.js";
import type { Inventory } from "./inventory.js";
import type { PlanLookup } from "./schema/plan.js";
import type { ShapeLookup } from "./schema/shape.js";
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
  /**
   * Where Maple's route is mounted, such as `/api/maple`. Nothing under it is
   * recorded or mocked; `/mock/schema` answers shapes and `/mock/plan` plans.
   */
  readonly route?: string;
  /** Each call's shape, in place of the route's. */
  readonly shape?: ShapeLookup;
}

/** The installed transport. */
export interface MockHandle {
  /** The recipe in force, read once at install. */
  readonly recipe: Recipe | undefined;
  readonly inventory: Inventory;
  /** Each call's shape, when the page has a source for them. */
  readonly shape?: ShapeLookup;
  /** Plans a sentence through Maple's route, when the page names one. */
  readonly plan?: PlanLookup;
  /** The recipe applying on the page's current route, which a comment records. */
  current?(): Recipe | undefined;
  /** Restores `fetch` and `XMLHttpRequest`. */
  dispose(): void;
}

const CODECS: readonly Codec[] = [trpcCodec(), restCodec];

/**
 * Wraps `fetch` and `XMLHttpRequest` and applies the active recipe. A second
 * call returns the first handle rather than wrapping twice.
 */
export function installMock(options: InstallOptions = {}): MockHandle {
  const existing = installedMock();
  if (existing !== undefined) return existing;

  const storage = options.storage ?? tabStorage();
  const recipe = activeRecipe(storage, options.logger);
  const inventory = createInventory(storage === undefined ? {} : { storage });
  const forward = options.fetch ?? globalThis.fetch.bind(globalThis);
  const ignored = (url: string) => ignores(options, new URL(url));
  const shape = shapeLookup(options, forward);
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
        ...(shape === undefined ? {} : { shape }),
      });
      if (response !== undefined) controller.respondWith(response);
    }),
  );
  // Not awaited: the interceptor holds the page's response until a listener
  // settles, and reading a streamed batch to its end would hold it that long.
  interceptor.on("response", ({ isMockedResponse, request, response }) => {
    const copy = isMockedResponse || ignored(request.url) ? undefined : buffered(response);
    if (copy === undefined) return release(response);
    const at = route();
    remember(request, copy, codecs)
      .then(
        (found) => found && record(inventory, found.calls, found.answers, { route: at }),
        (error: unknown) =>
          options.logger?.debug("Could not record a response.", { error: String(error) }),
      )
      .finally(() => release(response));
  });
  interceptor.apply();

  const plan =
    options.route === undefined
      ? undefined
      : routePlan({ basePath: options.route, fetch: forward });
  const handle: MockHandle = {
    recipe,
    inventory,
    ...(shape === undefined ? {} : { shape }),
    ...(plan === undefined ? {} : { plan }),
    current: () => (recipe?.route === undefined || recipe.route === route() ? recipe : undefined),
    dispose() {
      interceptor.dispose();
      keepInstalled(undefined);
    },
  };
  keepInstalled(handle);
  return handle;
}

/** Maple's own route is never the page's data, and neither is anything the host names. */
function ignores(options: InstallOptions, url: URL): boolean {
  const base = options.route?.replace(/\/$/, "");
  if (base !== undefined && (url.pathname === base || url.pathname.startsWith(`${base}/`))) {
    return true;
  }
  return options.ignore?.(url) ?? false;
}

function shapeLookup(options: InstallOptions, forward: typeof fetch): ShapeLookup | undefined {
  if (options.shape !== undefined) return options.shape;
  return options.route === undefined
    ? undefined
    : routeShapes({ basePath: options.route, fetch: forward });
}

/**
 * A JSON copy, read from the moment it arrives: tRPC's stream link aborts once
 * its last call answers, before the stream ends. The codec judges what is kept.
 */
function buffered(response: Response): Promise<Response> | undefined {
  const { body, headers, status, statusText } = response;
  if (body === null || !isJson(headers.get("content-type"))) return undefined;
  return drain(body).then((bytes) => new Response(bytes, { headers, status, statusText }));
}

/** Every byte until the end, or until the stream errors. */
async function drain(body: ReadableStream<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  try {
    for (let next = await reader.read(); !next.done; next = await reader.read()) {
      chunks.push(next.value);
    }
  } catch {
    // Aborted by the page: keep what arrived.
  }
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes;
}

/** A passthrough response, read into the answers worth recording. */
async function remember(request: Request, copy: Promise<Response>, codecs: readonly Codec[]) {
  const split = await splitRequest(request, undefined, codecs);
  const response = await copy;
  if (split === undefined) return undefined;
  const answers = await split.codec.read(response, split.calls);
  return { calls: split.calls, answers };
}

/**
 * Cancels the listener's copy of a body nothing read. It is a tee of the
 * page's stream: while it is open, the page cannot cancel its own.
 */
function release(response: Response): void {
  if (!response.bodyUsed) response.body?.cancel().catch(() => undefined);
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
