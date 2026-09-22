/**
 * The reviewer state machine's vocabulary, framework-free.
 *
 * Everything here is structural — plain data, plain Promises, plain `Error`
 * subclasses — because this is public surface and because a React, Svelte or
 * Astro binding should be a `subscribe` call over it rather than a rewrite of
 * it. Logic that ends up in a hook body instead of behind these types is
 * logic the next binding has to write again.
 */

import type { Anchor } from "../anchor/types.js";
import type { CommentKind, KindGuess, Pillar, PillarScore } from "../connectors/types.js";
import type { Draft } from "../overlay/drafts.js";
import type { Approval, Comment, CommentContext, MapleUser, MediaRef, PickKind } from "../types.js";
import type { MapleFailure } from "./failure.js";

/** The picker's word. Declared with the domain vocabulary, because the anchor
 * reads it back off a stored comment and the two cannot both own it. */
export type { PickKind } from "../types.js";

/** The five filters the inventory offers, in the order it shows them. */
export const COMMENT_FILTERS = ["all", "open", "needs_reverify", "unpinned", "resolved"] as const;

/** One of {@link COMMENT_FILTERS}. `unpinned` is the word for `orphaned`. */
export type CommentFilter = (typeof COMMENT_FILTERS)[number];

/** The four corners the island may sit in, nearest-first is not a thing here. */
export const CORNERS = ["bottom-right", "bottom-left", "top-right", "top-left"] as const;

/** One of {@link CORNERS}. The island snaps to these and to nothing between. */
export type Corner = (typeof CORNERS)[number];

/** The two amounts of detail a surface shows. Neither changes what is recorded. */
export const DETAILS = ["default", "developer"] as const;

/**
 * One of {@link DETAILS}. `default` names what a comment is on; `developer`
 * adds the rung, the confidence, the paths and the page's numbers. The export
 * fence carries every field either way, which is what makes `default` safe.
 */
export type Detail = (typeof DETAILS)[number];

/** Light or dark, for the host page and for the overlay drawn over it. */
export type Scheme = "dark" | "light";

/** What a viewer may ask the overlay to be drawn in. */
export const THEME_PREFERENCES = ["auto", "light", "dark"] as const;

/**
 * One of {@link THEME_PREFERENCES}. `auto` is the opposite of the host page,
 * so the overlay reads as a guest on it rather than as part of it; the other
 * two are taken literally, whatever the page underneath is doing.
 */
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

/** Which signal decided the host's scheme; earlier in the union is surer. */
export type ThemeSource = "attribute" | "class" | "color-scheme" | "luminance" | "preference";

/** The two schemes, which are not the same scheme and never collapse into one. */
export interface ThemeState {
  /** The host page's. This is the scheme a comment records, always. */
  readonly host: Scheme;
  /** The overlay's: the opposite, because a guest matching the wallpaper is invisible. */
  readonly overlay: Scheme;
  readonly source: ThemeSource;
}

/** What an open composer is pointed at. */
export interface ComposerTarget {
  readonly kind: PickKind;
  readonly anchor: Anchor;
  /** What a reviewer would call it, for the ring's label: "the Yield card". */
  readonly label?: string;
  /** The page's shape at pick time, already in the shape a comment keeps. */
  readonly context?: CommentContext;
}

/** What is known about the comment being written, and how sure Maple is. */
export interface AssistState {
  /** `judging` is a judgement asked for, not a judgement withheld. */
  readonly status: "idle" | "judging" | "ready";
  readonly scores: readonly PillarScore[];
  /** Null until one arrives, and when nothing classifies. */
  readonly kind: KindGuess | null;
  /**
   * What the reviewer said it is. It beats {@link AssistState.kind} wherever
   * both exist: a person looking at the page outranks a sentence classifier.
   */
  readonly chosenKind?: CommentKind;
}

/** The composer, whether or not it is showing. */
export interface ComposerState {
  readonly open: boolean;
  /**
   * The comment being read, when the panel was opened on one rather than on a
   * pick. A row cannot carry the context badge or the screenshot.
   */
  readonly viewing?: string;
  readonly target?: ComposerTarget;
  /** The draft being written into. Survives a close; cleared by a send. */
  readonly draftId?: string;
  readonly body: string;
  readonly attachments: readonly MediaRef[];
  /** There is something unsent. The only thing `beforeunload` is keyed off. */
  readonly dirty: boolean;
  readonly sending: boolean;
  /** Advice about what is written. Never blocks, delays or rewrites a send. */
  readonly assist: AssistState;
  /**
   * Whether the context card is showing everything it captured. It opens on a
   * pick, closes itself on the first keystroke, and reopens only when asked.
   */
  readonly contextOpen: boolean;
}

/** Whether a pick is armed, and which one. */
export interface PickState {
  readonly armed: boolean;
  readonly kind?: PickKind;
}

/** Everything a binding renders from. One object, replaced whole on a change. */
export interface ClientState {
  readonly phase: "error" | "idle" | "loading" | "ready";
  /** Every comment on the branch, whatever the filter says. */
  readonly comments: readonly Comment[];
  /** The comments the current filter shows, in the order to render them. */
  readonly visible: readonly Comment[];
  readonly filter: CommentFilter;
  /** Presentation only. Nothing is recorded differently in either. */
  readonly detail: Detail;
  /** Which corner the island sits in, after a drag or a query string. */
  readonly position: Corner;
  /** Hidden for this session. Not gone: anything arriving brings it back. */
  readonly hidden: boolean;
  /** The comment a link asked for, or a mark answered to. Null when none. */
  readonly selected: string | null;
  /**
   * What a surface is pointing at this moment: a hovered row or mark. It
   * sticks to nothing; `selected` is the one that outlives a pointer leaving.
   */
  readonly peeked: string | null;
  /** Off by default: resolved comments are hidden until someone asks for them. */
  readonly showResolved: boolean;
  /** The pill's number: everything not resolved, unpinned included. */
  readonly openCount: number;
  /** Unsent comments on this branch, newest first. */
  readonly drafts: readonly Draft[];
  /** A publish is in flight, so the control says so rather than repeating it. */
  readonly publishing: boolean;
  readonly composer: ComposerState;
  readonly pick: PickState;
  readonly theme: ThemeState;
  /** What the viewer asked the overlay to be drawn in. Remembered per origin. */
  readonly themePreference: ThemePreference;
  /** Null once `GET /me` has answered with no session: offer the guest flow. */
  readonly user: MapleUser | null;
  /** Whether this reviewer has a GitHub account linked, and what it is doing. */
  readonly github: GitHubLink;
  /**
   * What went wrong, as something a surface can act on. Null when nothing did.
   * A message alone cannot tell "sign in" from "the store is down".
   */
  readonly error: MapleFailure | null;
  /**
   * Whether the page carries the tagger's attributes. False means no comment
   * can name a component or a file, which is a build to fix.
   */
  readonly tagged: boolean;
  /**
   * Whether this deployment has anywhere to keep a screenshot. False means the
   * strip says so rather than offering one and dropping it.
   */
  readonly media: boolean;
  /**
   * What this deployment can say about a comment being written. Null when no
   * classifier is configured, or when the viewer switched the tier off.
   */
  readonly assist: AssistConfig | null;
  /**
   * Whether this deployment takes an approval, and whether the gate is
   * waiting for one. Null until `GET /me` has answered.
   */
  readonly approval: ApprovalConfig | null;
  /** Every approval on this surface, newest first. Empty when none was left. */
  readonly approvals: readonly Approval[];
  /** This reviewer's own approval of the commit on show, when they left one. */
  readonly myApproval: Approval | null;
}

/**
 * What a surface needs before it can offer an approval.
 *
 * Two fields rather than one, because a deployment with nowhere to keep an
 * approval and one that keeps them but does not insist are different things:
 * the first draws nothing, the second draws an offer.
 */
export interface ApprovalConfig {
  /** The store keeps approvals and this reviewer could leave one. */
  readonly supported: boolean;
  /** The merge gate is held until somebody does. */
  readonly required: boolean;
}

/** What a surface needs before it can draw a judgement. */
export interface AssistConfig {
  /** In the order to show them. Empty when the connector only classifies. */
  readonly pillars: readonly Pillar[];
}

/**
 * The reviewer's GitHub link, as a surface reads it. `unsupported` is the
 * resting state of a deployment that stores comments some other way: there is
 * nothing to offer, so nothing is drawn.
 */
export type GitHubLink =
  | { readonly state: "unsupported" }
  | { readonly state: "unlinked" }
  | { readonly state: "linked"; readonly login?: string }
  | {
      readonly state: "linking";
      /** Shown to the reviewer. Short, and meant to be typed or read aloud. */
      readonly userCode: string;
      readonly verificationUri: string;
      /** Milliseconds since the epoch. */
      readonly expiresAt: number;
    }
  | { readonly state: "failed"; readonly reason: string };

/** What a client may claim about a resolution; the route stamps the time. */
export interface ResolutionClaim {
  readonly sha: string;
  readonly note?: string;
}

/** A comment on its way to `POST /comments`, before the route names its author. */
export interface PostedComment {
  readonly branch: string;
  /** How a person names this surface, when the application knows a nicer name. */
  readonly label?: string;
  /** The commit the page was serving, when the application stamps one. */
  readonly commit?: string;
  readonly body: string;
  readonly anchor: Anchor;
  /** ISO 8601, UTC. The store may overwrite it; it is not the client's to trust. */
  readonly createdAt: string;
  readonly context?: CommentContext;
  readonly attachments?: readonly MediaRef[];
}
