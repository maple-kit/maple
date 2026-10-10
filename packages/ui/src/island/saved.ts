/**
 * What the island means by a saved draft, and by a reviewer who cannot publish.
 *
 * Every keystroke is stored so a reload loses nothing, which puts the comment
 * being typed in `drafts` beside the ones the reviewer chose to keep. Only the
 * kept ones are drafts as far as the island's lists and counts are concerned.
 */

import { useMaple } from "@maple-kit/react";

import type { Draft } from "@maple-kit/core/overlay";

/** The drafts the reviewer saved: all but the new one still being typed. */
export function useSavedDrafts(): readonly Draft[] {
  const { composer, drafts } = useMaple();
  const typing = composer.open && composer.resumed !== true ? composer.draftId : undefined;
  return typing === undefined ? drafts : drafts.filter((draft) => draft.id !== typing);
}

/**
 * Whether publishing needs a sign-in the reviewer has not done. A deployment
 * with no sign-in at all, or a paired solo bridge, publishes without one.
 */
export function useSignedOut(): boolean {
  const { github, solo, user } = useMaple();
  if (user !== null || solo) return false;
  return github.state === "unlinked" || github.state === "linking" || github.state === "failed";
}
