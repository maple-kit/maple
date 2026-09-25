/**
 * `GET {base}/mock/schema?key=…`: the shape of each call a page asks about.
 *
 * Shapes are served per key and never bundled, so a schema reaches only a
 * preview whose host switched mocking on, and only a reviewer the identity
 * connector resolves. The documents are normalised once, on first request.
 */

import { createShapeIndex } from "../mock/shape.js";

import type { SchemaDocument, Shape, ShapeIndex } from "../mock/shape.js";

/** How the route serves shapes. */
export interface MockRouteOptions {
  /**
   * The host's preview build switch, never `NODE_ENV`: a preview is a
   * production build. False, the endpoint answers 404.
   */
  readonly preview: boolean;
  /** OpenAPI documents, highest rung first, or a function that reads them once. */
  readonly schemas?: readonly SchemaDocument[] | (() => Promise<readonly SchemaDocument[]>);
}

/** The most keys one request may ask about: the box asks for a route's calls at once. */
export const MOCK_SCHEMA_KEYS = 100;

/** What the handler holds: the index, built on first use. */
export interface MockSchemas {
  readonly preview: boolean;
  index(): Promise<ShapeIndex>;
}

/** Builds the lazily normalised index once, when the handler is. */
export function createMockSchemas(options: MockRouteOptions): MockSchemas {
  let built: Promise<ShapeIndex> | undefined;
  return {
    preview: options.preview,
    index() {
      built ??= documents(options.schemas).then(createShapeIndex);
      return built;
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

async function documents(source: MockRouteOptions["schemas"]): Promise<readonly SchemaDocument[]> {
  if (source === undefined) return [];
  return typeof source === "function" ? source() : source;
}
