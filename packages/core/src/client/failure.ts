/**
 * What went wrong, in a shape a surface can act on rather than only print.
 *
 * A message alone is a dead end: the overlay cannot tell "sign in first" from
 * "the store is down" from "you are offline", so it draws the same grey line
 * for all three, or — as it did — draws nothing and reads as a control that
 * did not hear the click. The kind is what a surface branches on; the sentence
 * is what it shows.
 */

import { MapleRequestError } from "./transport.js";

/** What a reviewer can do about it, which is what a surface branches on. */
export type FailureKind = "offline" | "store" | "unauthorized" | "unknown";

/** Which call failed, so a retry knows what to run again. */
export type FailedCall = "approve" | "link" | "load" | "send" | "status";

/** A failure, in the words a reviewer reads and the shape a surface reads. */
export interface MapleFailure {
  readonly kind: FailureKind;
  /** One sentence, already addressed to a reviewer. */
  readonly message: string;
  readonly during: FailedCall;
  /** The route's own status, where there was one. */
  readonly status?: number;
}

/** The sentence for each kind, per call, so no surface writes its own. */
const SAID: Readonly<Record<FailureKind, Readonly<Record<FailedCall, string>>>> = {
  unauthorized: {
    approve: "Sign in before you can approve this preview.",
    load: "Sign in before this deployment can show you its comments.",
    send: "Sign in before this deployment can post your comment.",
    status: "Sign in before this deployment can change a comment.",
    link: "GitHub would not accept the sign-in.",
  },
  offline: {
    approve: "Could not reach this deployment to approve the preview.",
    load: "Could not reach this deployment to load its comments.",
    send: "Could not reach this deployment. Your comment is kept here.",
    status: "Could not reach this deployment to change the comment.",
    link: "Could not reach this deployment to sign in.",
  },
  store: {
    approve: "The comment store refused the approval.",
    load: "The comment store refused the request, so nothing could be loaded.",
    send: "The comment store refused your comment. It is kept here.",
    status: "The comment store refused the change.",
    link: "The comment store refused the sign-in.",
  },
  unknown: {
    approve: "Something went wrong approving the preview.",
    load: "Something went wrong loading the comments.",
    send: "Something went wrong sending your comment. It is kept here.",
    status: "Something went wrong changing the comment.",
    link: "Something went wrong signing in.",
  },
};

/** A 401 or 403 is the reviewer's to fix; a 5xx or a 4xx is not. */
function kindOf(error: unknown): FailureKind {
  if (!(error instanceof MapleRequestError)) return "offline";
  if (error.status === 401 || error.status === 403) return "unauthorized";
  return error.status === 0 ? "offline" : "store";
}

/**
 * Turns whatever a call threw into a failure.
 *
 * A thrown `TypeError` from `fetch` is the network, not the store: it is the
 * one failure with no status, and it is the one a reviewer fixes by looking at
 * their own connection.
 */
export function failureFrom(error: unknown, during: FailedCall): MapleFailure {
  const kind = kindOf(error);
  const status = error instanceof MapleRequestError ? error.status : undefined;

  return {
    kind,
    message: SAID[kind][during],
    during,
    ...(status === undefined ? {} : { status }),
  };
}

/**
 * What the route itself said, kept for the log rather than for the overlay: it
 * can name a repository, a rate limit or a token about to expire.
 */
export function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
