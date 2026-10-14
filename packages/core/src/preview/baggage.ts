/**
 * Reading one entry out of a W3C `baggage` header.
 *
 * mirrord's default filter is a substring regex, so `mirrord-session=maple-test2`
 * reaches the `maple-test` preview. The name is therefore matched exactly here,
 * and the first entry wins when a client sent several.
 */

/** The value of the first entry called `name`, or undefined. */
export function baggageEntry(header: string | undefined, name: string): string | undefined {
  if (header === undefined) return undefined;

  for (const member of header.split(",")) {
    const entry = member.split(";", 1)[0] ?? "";
    const at = entry.indexOf("=");
    if (at === -1 || entry.slice(0, at).trim() !== name) continue;

    const value = decoded(entry.slice(at + 1).trim());
    if (value) return value;
  }
  return undefined;
}

function decoded(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}
