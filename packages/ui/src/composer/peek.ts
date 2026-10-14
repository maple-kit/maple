/**
 * Hold Space to see the layout the comment is about.
 *
 * Where Maple is mounted inside someone else's application it cannot move the
 * layout, so the panel gets out of the way instead. A bare key checks its
 * modifiers and where it landed for the same reason the mock key does: Space in a
 * textarea is a space, and on a host's button it is a click.
 */

import { OVERLAY_MARKER } from "@maple-kit/core/anchor";
import { isEditable } from "@maple-kit/core/client";
import { useEffect, useState } from "react";

interface Held {
  readonly key: string;
  readonly code?: string;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
  readonly target?: unknown;
  readonly composedPath?: () => readonly unknown[];
}

/** Host elements Space acts on: it activates them, or scrolls them. */
const SPACE_TAKERS =
  "button,a[href],input,summary,[tabindex]:not([tabindex='-1']),[role=button],[role=checkbox],[role=switch],[role=radio],[role=tab],[role=menuitem]";

/**
 * True while Space means "show me the page" and not "type a space". What was
 * typed into is the head of the path: a shadow root retargets `target` to its
 * host, and this listens on `window`, so every composer key looks like a `div`.
 * Focus on a host control outside Maple is the host's: Space clicks or scrolls it.
 */
export function peeks(event: Held): boolean {
  // `event.code` is layout-independent; `key` is not.
  if (event.code !== "Space" && event.key !== " ") return false;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
  const path = event.composedPath?.() ?? [];
  const from = path[0] ?? event.target;
  if (isEditable(from)) return false;
  const inMaple = path.some((node) => (node as Element).hasAttribute?.(OVERLAY_MARKER));
  return inMaple || !(from as Element | undefined)?.matches?.(SPACE_TAKERS);
}

/** What the hook attaches to. `window` satisfies it. */
export interface PeekView {
  addEventListener(type: string, listener: EventListener, options?: AddEventListenerOptions): void;
  removeEventListener(type: string, listener: EventListener): void;
}

/** Whether Space is held. A lost focus releases, so no key sticks down. */
export function useHoldToPeek(view: PeekView | null | undefined, enabled: boolean): boolean {
  const [peeking, setPeeking] = useState(false);

  useEffect(() => {
    if (!view || !enabled) return;

    const controller = new AbortController();
    const options = { signal: controller.signal };
    const down = (event: Event): void => {
      if (!peeks(event as KeyboardEvent)) return;
      event.preventDefault();
      setPeeking(true);
    };

    view.addEventListener("keydown", down, options);
    view.addEventListener("keyup", () => setPeeking(false), options);
    view.addEventListener("blur", () => setPeeking(false), options);
    return () => controller.abort();
  }, [view, enabled]);

  return enabled && peeking;
}
