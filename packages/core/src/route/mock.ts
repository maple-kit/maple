/**
 * `GET {base}/mock/schema?key=…`: the shape of each call a page asks about.
 *
 * Shapes are served per key and never bundled, so a schema reaches only a
 * preview whose host switched mocking on, and only a reviewer the identity
 * connector resolves. The documents are normalised once, on first request.
 */

import { identityRules, isServerIdentity, serverIdentityRules } from "../mock/identity.js";
import { createShapeIndex } from "../mock/shape.js";

import type { IdentityRules, IdentitySource } from "../mock/identity.js";
import type { CallEntry, SchemaDocument, Shape, ShapeIndex } from "../mock/shape.js";
import type { MockPlanOptions } from "./plan.js";

/** How the route serves shapes. */
export interface MockRouteOptions {
  /**
   * The host's preview build switch, never `NODE_ENV`: a preview is a
   * production build. False, the endpoint answers 404.
   */
  readonly preview: boolean;
  /** OpenAPI documents, highest rung first, or a function that reads them once. */
  readonly schemas?: readonly SchemaDocument[] | (() => Promise<readonly SchemaDocument[]>);
  /**
   * Reads a reviewer's sentence at `/mock/plan`. Absent, or with a classifier
   * that does not plan, that endpoint answers 404.
   */
  readonly plan?: MockPlanOptions;
  /**
   * Who a reviewer is, for `as`, at `/mock/identity`: a session call or a
   * server render's `read`. Absent, `{ "identity": null }`; no preview, 404.
   */
  readonly identity?: IdentitySource;
}

/** The most keys one request may ask about: the box asks for a route's calls at once. */
export const MOCK_SCHEMA_KEYS = 100;

/** How many calls one `/mock/calls` page lists. */
export const MOCK_CALLS_PAGE = 20;

/** The longest search a request may carry. */
export const MOCK_CALLS_QUERY = 200;

/** What the handler holds: the index, built on first use. */
export interface MockSchemas {
  readonly preview: boolean;
  index(): Promise<ShapeIndex>;
  /**
   * The identity rules; undefined when the host declares none. A server
   * render's `read` runs only when given the request.
   */
  identity(request?: Request): Promise<IdentityRules | undefined>;
}

/** Builds the lazily normalised index once, when the handler is. */
export function createMockSchemas(options: MockRouteOptions): MockSchemas {
  let built: Promise<ShapeIndex> | undefined;
  const index = () => {
    built ??= documents(options.schemas).then(createShapeIndex);
    return built;
  };
  const source = options.identity;
  return {
    preview: options.preview,
    index,
    async identity(request) {
      if (source === undefined) return undefined;
      if (isServerIdentity(source)) {
        const current = request === undefined ? null : await source.read(request);
        return serverIdentityRules(source, current);
      }
      return identityRules(source, (await index()).find(source.call));
    },
  };
}

/** The shapes of the keys asked for; a key nothing describes is left out. */
export async function shapesFor(
  schemas: MockSchemas,
  keys: readonly string[],
): Promise<Record<string, Shape>> {
  const index = await schemas.index();
  const found: Record<string, Shape> = {};
  for (const key of keys) {
    const shape = index.find(key);
    if (shape !== undefined) found[key] = shape;
  }
  return found;
}

/** One page of the calls the documents describe. */
export interface CallsPage {
  readonly calls: readonly CallEntry[];
  /** Where the next page starts; absent on the last. */
  readonly next?: string;
}

/**
 * The calls whose method, path or summary hold every word of `query`, case
 * aside, a page at a time. The cursor is an offset into the matches.
 */
export async function callsFor(
  schemas: MockSchemas,
  query: string,
  offset: number,
): Promise<CallsPage> {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (await schemas.index()).calls.filter((call) => {
    const text = `${call.method} ${call.path} ${call.summary ?? ""}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
  const end = offset + MOCK_CALLS_PAGE;
  return {
    calls: matches.slice(offset, end),
    ...(end < matches.length ? { next: String(end) } : {}),
  };
}

async function documents(source: MockRouteOptions["schemas"]): Promise<readonly SchemaDocument[]> {
  if (source === undefined) return [];
  return typeof source === "function" ? source() : source;
}
