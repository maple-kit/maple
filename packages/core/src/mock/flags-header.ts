/**
 * `x-maple-flags`: the flags a server read while it answered a request, so the
 * mock box can list them. Plain strings, so a page and a server share it.
 */

/** The response header a server names the flags it read in. */
export const FLAGS_HEADER = "x-maple-flags";

/** The most bytes of header value written; keys that do not fit are dropped. */
export const FLAGS_HEADER_LIMIT = 4096;

/** The longest flag key kept, as the plan route accepts; longer ones are dropped. */
export const FLAG_KEY_LIMIT = 300;

/** Keys as a header value: comma-separated, URL-encoded, whole keys only, within the cap. */
export function formatFlagsHeader(keys: Iterable<string>): string {
  let value = "";
  for (const key of keys) {
    if (key.length > FLAG_KEY_LIMIT) continue;
    const next = value === "" ? encodeURIComponent(key) : `${value},${encodeURIComponent(key)}`;
    if (next.length > FLAGS_HEADER_LIMIT) break;
    value = next;
  }
  return value;
}

/** The keys a header value names; past the cap, or too long, or undecodable, an entry is skipped. */
export function parseFlagsHeader(value: string | null | undefined): string[] {
  const keys: string[] = [];
  for (const part of whole(value ?? "").split(",")) {
    if (part === "") continue;
    try {
      const key = decodeURIComponent(part);
      if (key.length <= FLAG_KEY_LIMIT) keys.push(key);
    } catch {
      continue;
    }
  }
  return keys;
}

/** The value within the cap, cut back to a whole key so a half key is never read. */
function whole(value: string): string {
  if (value.length <= FLAGS_HEADER_LIMIT) return value;
  return value.slice(0, Math.max(0, value.lastIndexOf(",", FLAGS_HEADER_LIMIT)));
}
