/**
 * What the composer keeps beside the controller's held image: the preview made
 * from it, and the application's own upload.
 *
 * Both are small objects with methods, so a handler can change them without
 * the render that reads them seeing a mutated prop.
 */

import { previewOf } from "@maple-kit/core/screenshot";

import type { MediaRef } from "@maple-kit/core";
import type { HeldImage } from "@maple-kit/core/client";
import type { PastedImage, Preview } from "@maple-kit/core/screenshot";

/** The application's `upload` override, or nothing for the route's own. */
export type Upload = (image: PastedImage) => Promise<MediaRef>;

/** Where `Maple.Attachments` leaves its `upload` prop for the scope to read. */
export interface UploadSeam {
  set(upload: Upload | undefined): void;
  get(): Upload | undefined;
}

export function createUploadSeam(): UploadSeam {
  let current: Upload | undefined;
  return {
    set(upload) {
      current = upload;
    },
    get: () => current,
  };
}

/** Blob URLs, one per held image, revoked when the image is let go. */
export interface Previews {
  /** Makes the preview for an image about to be held. */
  make(held: HeldImage): Preview;
  of(held: HeldImage | undefined): Preview | undefined;
  /** Revokes and forgets one. */
  forget(held: HeldImage | undefined): void;
  /** Revokes every one: the composer is gone. */
  clear(): void;
}

export function createPreviews(): Previews {
  const made = new Map<HeldImage, Preview>();

  function forget(held: HeldImage | undefined): void {
    if (!held) return;
    made.get(held)?.revoke();
    made.delete(held);
  }

  return {
    make(held) {
      const preview = previewOf({ blob: held.blob, type: held.contentType });
      made.set(held, preview);
      return preview;
    },
    of: (held) => (held ? made.get(held) : undefined),
    forget,
    clear() {
      for (const preview of made.values()) preview.revoke();
      made.clear();
    },
  };
}
