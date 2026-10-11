/**
 * Which of the matching elements are worth a judge's attention: repeated
 * components collapsed to one, changed code first, then the caps.
 *
 * Nothing here touches the DOM, so it runs in Node and is a table of cases.
 */

/** Matches that look the same, represented by the first of them. */
export interface Group<T> {
  readonly first: T;
  /** Every element in the group, the representative included. */
  readonly size: number;
}

/** What a rule's groups became once the sources and the room were applied. */
export interface Chosen<T> {
  readonly kept: readonly Group<T>[];
  /** Groups left out for want of room. */
  readonly capped: number;
  /** Groups left out because their file is not among the changed ones. */
  readonly notChanged: number;
}

const POSITION = /(?::\d+){1,2}$/;

/** The file part of a `file:line:col` source tag. */
export function sourceFile(source: string): string {
  return source.replace(POSITION, "");
}

/**
 * What makes two elements the same component: where they were written, and
 * their markup once the parts that differ per instance are gone. The caller
 * has already replaced text and volatile attribute values. Digits in classes
 * stay: `p-2` and `p-4` are different components to a design rule.
 */
export function signatureOf(source: string | undefined, html: string): string {
  const shape = html.replaceAll(/\s+/g, " ").trim();
  return `${source ?? ""}\u0000${shape}`;
}

/** Groups in the order each was first seen, which is DOM order. */
export function groupBySignature<T extends { readonly signature: string }>(
  items: readonly T[],
): Group<T>[] {
  const groups = new Map<string, { first: T; size: number }>();
  for (const item of items) {
    const group = groups.get(item.signature);
    if (group === undefined) groups.set(item.signature, { first: item, size: 1 });
    else group.size += 1;
  }
  return [...groups.values()];
}

function isChanged(source: string, sources: readonly string[]): boolean {
  const file = sourceFile(source).replace(/^\.\//, "");
  return sources.some((one) => {
    const wanted = one.replace(/^\.\//, "");
    return file === wanted || file.endsWith(`/${wanted}`);
  });
}

/**
 * Keeps up to `room` groups. With `sources`, a group from a changed file goes
 * first, an untagged one only follows if there is room, and one from any other
 * file is out.
 */
export function choose<T extends { readonly source: string | undefined }>(
  groups: readonly Group<T>[],
  room: number,
  sources?: readonly string[],
): Chosen<T> {
  let ordered = groups;
  let notChanged = 0;
  if (sources !== undefined) {
    const tagged = groups.filter((g) => g.first.source !== undefined);
    const changed = tagged.filter((g) => isChanged(g.first.source!, sources));
    const untagged = groups.filter((g) => g.first.source === undefined);
    notChanged = tagged.length - changed.length;
    ordered = [...changed, ...untagged];
  }
  const kept = ordered.slice(0, room);
  return { kept, capped: ordered.length - kept.length, notChanged };
}
