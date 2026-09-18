/**
 * The DOM contract between the build-time tagger and everything that reads an
 * anchor. The attribute names and the source-location format are written down
 * once, here, because the tagger, the anchor cascade, the overlay and the
 * framework strip configuration all have to agree on them.
 *
 * docs/tagger.md is the design this implements.
 */

/** Prefix every Maple attribute shares, so a build can strip them by pattern. */
export const ATTRIBUTE_PREFIX = "data-maple-";

/** Pattern a framework's dead-attribute pass is configured with. */
export const ATTRIBUTE_PATTERN = `^${ATTRIBUTE_PREFIX}`;

/** Attribute carrying `path:line:column`, repository-relative and POSIX-separated. */
export const SOURCE_ATTRIBUTE = `${ATTRIBUTE_PREFIX}src`;

/** Attribute carrying the display name of the component the element is written in. */
export const NAME_ATTRIBUTE = `${ATTRIBUTE_PREFIX}name`;

/** Attribute an application sets itself to give a node a logical identity. */
export const KEY_ATTRIBUTE = `${ATTRIBUTE_PREFIX}key`;

/** Where a JSX element is written in the source that produced it. */
export interface SourceLocation {
  /** Repository-relative, POSIX-separated path. */
  readonly file: string;
  /** 1-based line. */
  readonly line: number;
  /** 1-based column, so the value reads the way an editor addresses it. */
  readonly column: number;
}

const LOCATION = /^(.+):(\d+):(\d+)$/;

/** Formats a location as `path:line:column`. */
export function formatSourceLocation(location: SourceLocation): string {
  return `${location.file}:${location.line}:${location.column}`;
}

/**
 * Parses `path:line:column`, or returns undefined when the value is not one.
 *
 * The file part is matched greedily so a path that itself contains a colon
 * still yields the last two segments as the line and column.
 */
export function parseSourceLocation(value: string): SourceLocation | undefined {
  const match = LOCATION.exec(value);
  if (!match) return undefined;

  const [, file, line, column] = match as unknown as [string, string, string, string];
  const parsed = { file, line: Number(line), column: Number(column) };
  return parsed.line > 0 && parsed.column > 0 ? parsed : undefined;
}
