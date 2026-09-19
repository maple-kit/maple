/**
 * How long ago a comment was written, in the shortest true form.
 *
 * `Intl.RelativeTimeFormat` is in every browser the overlay supports and costs
 * the bundle nothing, so this is a unit choice and a rounding rule rather than
 * a date library.
 */

/** Seconds in each unit, largest first. */
const UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

const FORMAT = /** @__PURE__ */ new Intl.RelativeTimeFormat(undefined, { style: "narrow" });

const EXACT = /** @__PURE__ */ new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * The same instant in the reader's own zone, for the tooltip behind the
 * relative one. "3h ago" is what a row is scanned for; which afternoon it was
 * is what someone asks a minute later, and the row should not have to say it.
 */
export function absoluteTime(iso: string): string {
  const at = Date.parse(iso);
  return Number.isFinite(at) ? EXACT.format(at) : "";
}

/** "3h ago", or "now" for anything inside the last minute. */
export function relativeTime(iso: string, now: number): string {
  const seconds = (Date.parse(iso) - now) / 1000;
  if (!Number.isFinite(seconds)) return "";

  for (const [unit, size] of UNITS) {
    const value = seconds / size;
    if (Math.abs(value) >= 1) return FORMAT.format(Math.round(value), unit);
  }
  return "now";
}
