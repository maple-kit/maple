/**
 * What the composer's five parts share, and no application reads.
 *
 * A pasted image lands on the panel, where the cursor is, and is drawn by
 * `Maple.Attachments`, which is elsewhere in the tree.
 */

import { createContext, useContext } from "react";

import type { UploadSeam } from "./held.js";
import type { MediaSource } from "@maple-kit/core";
import type { PastedImage, Preview } from "@maple-kit/core/screenshot";

/** How much of the sheet is showing. Two, and no third. */
export type SheetDetent = "full" | "half";

/** An image held for the comment, previewed from memory until it is published. */
export interface PendingImage {
  readonly image: PastedImage;
  /** `img-src blob:` is the one CSP directive Maple asks for, and this is why. */
  readonly preview: Preview;
  /**
   * Who put it here. It travels with the image because a reader of a stored
   * comment has no other way to tell Maple's own capture from a chosen one.
   */
  readonly source: MediaSource;
}

/** The composer's own scope. Nothing outside the package reads it. */
export interface ComposerScopeValue {
  readonly peeking: boolean;
  readonly detent: SheetDetent;
  readonly toggleDetent: () => void;
  readonly pending: PendingImage | undefined;
  /** The application's own upload, set by `Maple.Attachments`, read when an image is held. */
  readonly upload: UploadSeam;
  readonly offer: (image: PastedImage, source?: MediaSource) => void;
  readonly clear: () => void;
}

/** Internal: `Maple.Composer` is the only thing that fills it. */
export const ComposerScope = /** @__PURE__ */ createContext<ComposerScopeValue | null>(null);

/** Thrown by a composer part rendered outside `<Maple.Composer>`. */
export class ComposerScopeError extends Error {
  override readonly name = "ComposerScopeError";

  constructor(part: string) {
    super(`${part} was rendered outside <Maple.Composer>. Every part needs one above it.`);
  }
}

/** The scope, or a readable error rather than a null. */
export function useComposerScope(part: string): ComposerScopeValue {
  const value = useContext(ComposerScope);
  if (value === null) throw new ComposerScopeError(part);
  return value;
}
