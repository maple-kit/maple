/**
 * Deterministic JSON.
 *
 * The ```maple fence is rewritten on every export. If key order tracked
 * insertion order, an unchanged comment set would still produce a different
 * fence and churn the pull-request body, so keys are sorted before encoding.
 *
 * This replaces a dependency on safe-stable-stringify: Maple needs one function
 * from it, and cycle handling here throws rather than substituting a marker.
 */

/** Raised when the value graph contains a cycle. */
export class CyclicValueError extends TypeError {
  override readonly name = "CyclicValueError";

  constructor(readonly path: string) {
    super(`Cannot stringify a cyclic value; the cycle closes at ${path || "<root>"}.`);
  }
}

/** True for values JSON.stringify would drop from an object. */
function isDroppable(value: unknown): boolean {
  return value === undefined || typeof value === "function" || typeof value === "symbol";
}

/**
 * Orders keys by UTF-16 code point. Deliberately not localeCompare: that is
 * locale-dependent, and output has to be identical on every machine.
 */
function byCodePoint(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/** Recursively rebuilds `value` with every object's keys in sorted order. */
function sortValue(value: unknown, seen: Set<object>, path: string): unknown {
  if (value === null || typeof value !== "object") return value;

  if (seen.has(value)) throw new CyclicValueError(path);
  seen.add(value);

  const sorted = Array.isArray(value)
    ? value.map((item, index) => sortValue(item, seen, `${path}[${index}]`))
    : sortEntries(value as Record<string, unknown>, seen, path);

  seen.delete(value);
  return sorted;
}

/** Rebuilds one plain object with sorted keys, dropping non-JSON values. */
function sortEntries(
  value: Record<string, unknown>,
  seen: Set<object>,
  path: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort(byCodePoint)) {
    if (isDroppable(value[key])) continue;
    out[key] = sortValue(value[key], seen, path ? `${path}.${key}` : key);
  }
  return out;
}

/**
 * Serialises `value` to JSON with object keys in lexicographic order, so equal
 * values always produce byte-identical output.
 *
 * @throws {CyclicValueError} when `value` contains a cycle.
 */
export function stableStringify(value: unknown, space?: number | string): string {
  return JSON.stringify(sortValue(value, new Set(), ""), null, space);
}
