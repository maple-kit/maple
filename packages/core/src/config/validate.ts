/**
 * Config validation against Standard Schema v1.
 *
 * Maple ships no validation library. Anything implementing the 145-byte
 * Standard Schema interface works, so a host application validates Maple's
 * config with whatever it already depends on.
 */

import type { StandardSchemaV1 } from "@standard-schema/spec";

/** Raised when config does not satisfy its schema. */
export class MapleConfigError extends Error {
  override readonly name = "MapleConfigError";

  constructor(
    readonly label: string,
    readonly issues: readonly StandardSchemaV1.Issue[],
  ) {
    const lines = issues.map(formatIssue).map(indent).join("\n");
    super(`Invalid ${label}:\n${lines}`);
  }
}

/** Indents one rendered issue under the error's first line. */
function indent(line: string): string {
  return `  ${line}`;
}

/** Renders one issue as `path.to.field: message`, or just the message at the root. */
function formatIssue(issue: StandardSchemaV1.Issue): string {
  const path = (issue.path ?? [])
    .map((segment) => (typeof segment === "object" ? String(segment.key) : String(segment)))
    .join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

/**
 * Validates `input` against `schema`, returning the parsed value.
 *
 * @throws {MapleConfigError} when the schema reports issues.
 */
export async function validateConfig<S extends StandardSchemaV1>(
  schema: S,
  input: unknown,
  label = "configuration",
): Promise<StandardSchemaV1.InferOutput<S>> {
  const result = await schema["~standard"].validate(input);
  if (result.issues) throw new MapleConfigError(label, result.issues);
  return result.value;
}

/**
 * Synchronous form of {@link validateConfig}, for config read at module load.
 *
 * @throws {MapleConfigError} when the schema reports issues.
 * @throws {TypeError} when the schema validates asynchronously.
 */
export function validateConfigSync<S extends StandardSchemaV1>(
  schema: S,
  input: unknown,
  label = "configuration",
): StandardSchemaV1.InferOutput<S> {
  const result = schema["~standard"].validate(input);
  if (result instanceof Promise) {
    throw new TypeError(
      `Schema for ${label} validates asynchronously; use validateConfig() instead.`,
    );
  }
  if (result.issues) throw new MapleConfigError(label, result.issues);
  return result.value;
}
