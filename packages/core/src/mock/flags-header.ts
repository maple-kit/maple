/**
 * `x-maple-flags`: the flags a server read while it answered a request, so the
 * mock box can list them. Plain strings, so a page and a server share it.
 */

/** The response header a server names the flags it read in. */
export const FLAGS_HEADER = "x-maple-flags";

/** The most bytes of header value written; keys that do not fit are dropped. */
export const FLAGS_HEADER_LIMIT = 4096;

/** Keys as a header value: comma-separated, URL-encoded, whole keys only, within the cap. */
export function formatFlagsHeader(keys: Iterable<string>): string {
  let value = "";
  for (const key of keys) {
    const next = value === "" ? encodeURIComponent(key) : `${value},${encodeURIComponent(key)}`;
    if (next.length > FLAGS_HEADER_LIMIT) break;
    value = next;
  }
  return value;
}

/** The keys a header value names; an entry that cannot be decoded is skipped. */
export function parseFlagsHeader(value: string | null | undefined): string[] {
  const keys: string[] = [];
  for (const part of (value ?? "").split(",")) {
    if (part === "") continue;
    try {
      keys.push(decodeURIComponent(part));
    } catch {
      continue;
    }
  }
  return keys;
}
