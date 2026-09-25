/**
 * How the page finds a call's shape. The shape itself is the wire format in
 * `@maple-kit/core/mock`, which the route writes and this package reads.
 */

import type { Shape } from "@maple-kit/core/mock";

/** Finds a call's shape by key, or undefined when nothing describes it. */
export type ShapeLookup = (key: string) => Shape | undefined | Promise<Shape | undefined>;
