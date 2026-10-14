/**
 * Re-resolving anchors when the page changes under them.
 *
 * A dialog mounted after load, or torn down and built again, leaves marks
 * holding elements that are gone or never found. One observer on the document,
 * debounced, bumps a version the layer resolves again on; a result that names
 * the same elements as before is thrown away so nothing re-renders for it.
 */

import { OVERLAY_MARKER } from "@maple-kit/core/anchor";
import { useEffect, useRef, useState } from "react";

import type { Located } from "./placement.js";

/** Long enough that a burst of renders is one resolve, short enough to feel live. */
export const MUTATION_DEBOUNCE_MS = 150;

function isElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE;
}

/** Whether a record is the page's own, rather than the overlay settling in. */
function concerns(record: MutationRecord): boolean {
  if (record.type === "attributes") return true;
  return [...record.addedNodes, ...record.removedNodes].some(
    (node) => isElement(node) && !node.hasAttribute(OVERLAY_MARKER),
  );
}

/** A number that changes shortly after the page's structure or a dialog's `open` does. */
export function useDomVersion(doc: Document): number {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const view = doc.defaultView;
    if (!view) return undefined;
    let timer = 0;

    const observer = new MutationObserver((records) => {
      if (!records.some(concerns)) return;
      view.clearTimeout(timer);
      timer = view.setTimeout(() => setVersion((current) => current + 1), MUTATION_DEBOUNCE_MS);
    });
    observer.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open"],
    });

    return () => {
      observer.disconnect();
      view.clearTimeout(timer);
    };
  }, [doc]);

  return version;
}

function sameRange(a: Range | undefined, b: Range | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return (
    a.startContainer === b.startContainer &&
    a.startOffset === b.startOffset &&
    a.endContainer === b.endContainer &&
    a.endOffset === b.endOffset
  );
}

function sameMembers(a: Located["members"], b: Located["members"]): boolean {
  if (a === undefined || b === undefined) return a === b;
  return (
    a.length === b.length &&
    a.every(
      (member, index) =>
        member.element === b[index]?.element &&
        JSON.stringify(member.offset) === JSON.stringify(b[index]?.offset),
    )
  );
}

/** Two results are the same when everything but the objects rebuilt per resolve matches. */
export function sameSpot(a: Located, b: Located): boolean {
  const { range: ar, members: am, ...restA } = a;
  const { range: br, members: bm, ...restB } = b;
  const keys = Object.keys(restA) as (keyof typeof restA)[];
  return (
    keys.length === Object.keys(restB).length &&
    keys.every((key) => restA[key] === restB[key]) &&
    sameRange(ar, br) &&
    sameMembers(am, bm)
  );
}

/** Keeps the previous list while a fresh one says the same thing. */
export function useSteady<T extends Located>(next: readonly T[]): readonly T[] {
  const kept = useRef(next);
  const steady =
    kept.current.length === next.length &&
    kept.current.every((one, index) => sameSpot(one, next[index] as T));
  if (!steady) kept.current = next;
  return kept.current;
}
