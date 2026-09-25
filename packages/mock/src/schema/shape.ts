/**
 * A call's shape: its response schema and where it came from. Every source is
 * normalised to this, one per call key, and the box names the source.
 */

import type { JsonSchema } from "./json-schema.js";

/** Where a shape came from, highest rung first. */
export const SHAPE_SOURCES = [
  "supplied",
  "router",
  "validator",
  "introspection",
  "sample",
] as const;

/** One rung of the ladder in `docs/mock.md`. */
export type ShapeSource = (typeof SHAPE_SOURCES)[number];

/** One call's response, as a JSON Schema over what its data decodes to. */
export interface Shape {
  readonly schema: JsonSchema;
  readonly source: ShapeSource;
  /** The call travels in superjson's envelope, so a sampled date is a `Date`. */
  readonly superjson?: boolean;
}

/** Finds a call's shape by key, or undefined when nothing describes it. */
export type ShapeLookup = (key: string) => Shape | undefined | Promise<Shape | undefined>;
