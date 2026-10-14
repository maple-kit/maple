/**
 * What a preview environment tells Maple about a request.
 *
 * It is not a connector kind: a connector talks to a backend, and this only
 * reads the request that reached a preview. Plain Promises and structural
 * types, so an adopter can implement it without importing anything.
 */

import type { IdentityRequest } from "../connectors/types.js";

/** The headers and URL of a request, as the identity connector sees them. */
export type PreviewRequest = IdentityRequest;

/** Which signal named the key, strongest first. */
export type PreviewSource = "env" | "header" | "baggage";

/** The session a preview pod belongs to. */
export interface PreviewIdentity {
  /** The session key, exactly as the preview was started with. */
  readonly key: string;
  readonly source: PreviewSource;
  /** Trusted: the exact head branch the deploy states, never read off a request. */
  readonly branch?: string;
  /** Trusted: stated by the deploy, never read off a request. */
  readonly commit?: string;
  /** Trusted: stated by the deploy, never read off a request. */
  readonly pullRequest?: number;
}

/** A way of being served as a preview. */
export interface PreviewEnvironment {
  /** Shown to the overlay, such as `mirrord`. */
  readonly name: string;
  /** Where the key is expected from the deploy's env, and whether it was there. */
  readonly envKey?: { readonly name: string; readonly set: boolean };
  /** Null means this request is not served by a preview. */
  identify(request: PreviewRequest): Promise<PreviewIdentity | null>;
  /**
   * Whether an open head branch belongs to this identity, when nothing
   * exact found one. Detected by presence; no flag declares it.
   */
  matches?(head: string, identity: PreviewIdentity): boolean;
}
