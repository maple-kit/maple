/**
 * Hold Space to see the layout the comment is about.
 *
 * Where Maple is mounted inside someone else's application it cannot move the
 * layout, so the panel gets out of the way instead. A bare key checks its
 * modifiers and where it landed for the same reason the mock key does: Space in a
 * textarea is a space.
 */

import { isEditable } from "@maple-kit/core/client";
import { useEffect, useState } from "react";

/** `event.code` is layout-independent; `key` is not. */
const PEEK_CODE = "Space";

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

/**
 * What was typed into. A shadow root retargets `target` to its host, and this
 * listens on `window`, so every composer key arrives looking like a `div`.
 */
function origin(event: Held): unknown {
  const path = event.composedPath?.();
  return path !== undefined && path.length > 0 ? path[0] : event.target;
}

/** True while Space means "show me the page" and not "type a space". */
export function peeks(event: Held): boolean {
  if (event.code !== PEEK_CODE && event.key !== " ") return false;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false;
  return !isEditable(origin(event));
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
