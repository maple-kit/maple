/**
 * What the notice says beyond the failure's own sentence.
 *
 * The sentence comes from `@maple-kit/core/client`, so a Svelte binding reads
 * the same words. Only the offer is here, because only a surface has one.
 */

import type { FailureKind, GitHubLink } from "@maple-kit/core/client";

/** The notice's own words. */
export const NOTICE_COPY = {
  label: "Something went wrong",
  retry: "Try again",
  signIn: "Sign in",
  dismiss: "Dismiss",
  dismissGlyph: "✕",
  /** Said under a 401 on a deployment that offers no sign-in at all. */
  noSignIn: "This deployment has nowhere to put your comments yet.",
} as const;

/** Whether the offer is a sign-in or a retry. A 401 is nobody's to retry. */
export function offersSignIn(kind: FailureKind, linkable: boolean): boolean {
  return kind === "unauthorized" && linkable;
}

/** A 401 with no sign-in on offer is a setup gap, not the reviewer's doing:
 * "sign in" would point at a door that is not there. */
export function isSetupGap(kind: FailureKind, github: GitHubLink): boolean {
  return kind === "unauthorized" && github.state === "unsupported";
}
