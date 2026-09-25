/**
 * `GET {base}/mock/schema?key=…`: the shape of each call a page asks about.
 *
 * Shapes are served per key and never bundled, so a schema reaches only a
 * preview whose host switched mocking on, and only a reviewer the identity
 * connector resolves. The documents are normalised once, on first request.
 */

import { identityRules } from "../mock/identity.js";
import { createShapeIndex } from "../mock/shape.js";

import type { IdentityRules, IdentitySource } from "../mock/identity.js";
import type { SchemaDocument, Shape, ShapeIndex } from "../mock/shape.js";
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
   * Who a reviewer is, for a recipe's `as`, served at `/mock/identity`.
   * Absent, that endpoint answers 404.
   */
  readonly identity?: IdentitySource;
}

/** The most keys one request may ask about: the box asks for a route's calls at once. */
export const MOCK_SCHEMA_KEYS = 100;

/** What the handler holds: the index, built on first use. */
export interface MockSchemas {
  readonly preview: boolean;
  index(): Promise<ShapeIndex>;
  /** The identity rules, vocabularies filled in from the shapes; undefined when the host declares none. */
  identity(): Promise<IdentityRules | undefined>;
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
    async identity() {
      if (source === undefined) return undefined;
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

async function documents(source: MockRouteOptions["schemas"]): Promise<readonly SchemaDocument[]> {
  if (source === undefined) return [];
  return typeof source === "function" ? source() : source;
}
