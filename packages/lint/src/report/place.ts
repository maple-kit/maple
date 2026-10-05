/**
 * Where a finding is in the repository, read off the cascade's `source` rung.
 *
 * Only a tagged build has one. A finding without a place is still reported,
 * by its selector, but it cannot be drawn on a file.
 */

import { isAbsolute, relative, sep } from "node:path";

import type { Finding } from "../types.js";

/** A file, line and column in the checkout. */
export interface Place {
  /** Relative to the repository root, with forward slashes. */
  readonly path: string;
  readonly line: number;
  readonly column?: number;
}

const LOCATION = /^(.+?):(\d+)(?::(\d+))?$/;

/**
 * The place a finding's `anchor.source` names, or undefined when it names none.
 * An absolute path is made relative to `root`, and dropped when it is outside it.
 */
export function placeOf(finding: Finding, root?: string): Place | undefined {
  const match = LOCATION.exec(finding.anchor.source ?? "");
  if (match === null) return undefined;
  const [, raw = "", line = "", column] = match;

  const path = isAbsolute(raw) ? inside(raw, root) : raw.replace(/^\.\//, "");
  if (path === undefined || path === "") return undefined;
  return { path, line: Number(line), ...(column === undefined ? {} : { column: Number(column) }) };
}

function inside(absolute: string, root?: string): string | undefined {
  if (root === undefined) return undefined;
  const path = relative(root, absolute);
  if (path.startsWith("..") || isAbsolute(path)) return undefined;
  return path.split(sep).join("/");
}

/** `file:line:col`, or the selector when there is no file, or an empty string. */
export function describePlace(finding: Finding, root?: string): string {
  const place = placeOf(finding, root);
  if (place === undefined) return finding.anchor.selector ?? finding.anchor.component ?? "";
  const column = place.column === undefined ? "" : `:${String(place.column)}`;
  return `${place.path}:${String(place.line)}${column}`;
}
