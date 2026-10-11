/**
 * The images held for drafts, and the upload that happens at publish.
 *
 * A screenshot is a local blob while its comment is being written. Keeping it
 * here, by draft id, is what lets a draft be closed, switched away from and
 * resumed without the image going anywhere; publishing is the one moment it
 * leaves the page.
 */

import type { Draft } from "../overlay/drafts.js";
import type { MediaRef } from "../types.js";
import type { HeldImage } from "./types.js";

/** Where a held image goes when the host did not say otherwise. */
export type Put = (blob: Blob, contentType: string) => Promise<MediaRef>;

/** One image per draft, in memory. */
export interface ImageKeeper {
  get(draftId: string): HeldImage | undefined;
  hold(draftId: string, image: HeldImage): void;
  /** Forgets the image, and the upload that already happened for it. */
  drop(draftId: string): void;
  /**
   * Uploads the image of every draft that has one, and returns the drafts with
   * their references. An upload that already succeeded is not repeated on a retry.
   */
  upload(drafts: readonly Draft[], put: Put): Promise<readonly Draft[]>;
}

interface Entry {
  readonly image: HeldImage;
  ref?: MediaRef;
}

export function createImageKeeper(): ImageKeeper {
  const entries = new Map<string, Entry>();

  async function send(draft: Draft, put: Put): Promise<Draft> {
    const entry = entries.get(draft.id);
    if (entry === undefined) return draft;

    const { image } = entry;
    entry.ref ??= {
      ...(await (image.upload ?? put)(image.blob, image.contentType)),
      source: image.source,
    };
    return { ...draft, attachments: [...(draft.attachments ?? []), entry.ref] };
  }

  return {
    get: (draftId) => entries.get(draftId)?.image,
    hold(draftId, image) {
      entries.set(draftId, { image });
    },
    drop(draftId) {
      entries.delete(draftId);
    },
    async upload(drafts, put) {
      const sent: Draft[] = [];
      for (const draft of drafts) sent.push(await send(draft, put));
      return sent;
    },
  };
}
