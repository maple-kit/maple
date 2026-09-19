/**
 * The screenshot taken at pick time, handed from the picker to the composer.
 *
 * It has to be taken before the composer opens: the panel insets the frame it
 * is over, so a capture taken afterwards is of a layout 360px narrower than
 * the one the reviewer was looking at — which is the exact fact the context
 * badge exists to record. The picker and the attachment strip are siblings,
 * so the image travels through a store on the root's context rather than
 * through a prop neither of them could pass.
 */

import { createContext, useContext } from "react";

import type { PastedImage } from "@maple-kit/core/screenshot";

/** A one-slot store. There is one composer, so there is one image in flight. */
export interface ShotStore {
  /** The image waiting to be claimed, or nothing. */
  get(): PastedImage | undefined;
  /** Called by the picker, with what it captured. Replaces anything unclaimed. */
  put(image: PastedImage | undefined): void;
  /** Called by the strip: reads it and empties the slot in one go. */
  take(): PastedImage | undefined;
  subscribe(listener: () => void): () => void;
}

/** Builds the store. Holds a blob, touches no DOM, and is created per root. */
export function createShotStore(): ShotStore {
  const listeners = new Set<() => void>();
  let held: PastedImage | undefined;

  const tell = (): void => {
    for (const listener of listeners) listener();
  };

  return {
    get: () => held,
    put(image) {
      held = image;
      tell();
    },
    take() {
      const image = held;
      held = undefined;
      if (image) tell();
      return image;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Internal: `Maple.Root` fills it, and a root without one still renders. */
export const ShotContext = /** @__PURE__ */ createContext<ShotStore | null>(null);

/** The store, or nothing when a part is mounted without a root that made one. */
export function useShots(): ShotStore | null {
  return useContext(ShotContext);
}
