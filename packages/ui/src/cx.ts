/**
 * `cx`, alone in its module so a part that only joins class names, such as the
 * mock box, does not reach `Slot` through `part.ts`.
 */

/** Joins the part's own class with whatever the caller passed. */
export function cx(...names: readonly (false | string | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}
