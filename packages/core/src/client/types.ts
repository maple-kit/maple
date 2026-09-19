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
import type { Draft } from "../overlay/drafts.js";
import type { Comment, CommentContext, MapleUser, MediaRef } from "../types.js";

/** The five filters the inventory offers, in the order it shows them. */
export const COMMENT_FILTERS = ["all", "open", "needs_reverify", "unpinned", "resolved"] as const;

/** One of {@link COMMENT_FILTERS}. `unpinned` is the word for `orphaned`. */
export type CommentFilter = (typeof COMMENT_FILTERS)[number];

/** The three ways a reviewer says what a comment is about. */
export type PickKind = "element" | "region" | "text";

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
  readonly composer: ComposerState;
  readonly pick: PickState;
  readonly theme: ThemeState;
  /** What the viewer asked the overlay to be drawn in. Remembered per origin. */
  readonly themePreference: ThemePreference;
  /** Null once `GET /me` has answered with no session: offer the guest flow. */
  readonly user: MapleUser | null;
  /** What went wrong, in words a reviewer can read. Null when nothing did. */
  readonly error: string | null;
}

/** What a client may claim about a resolution; the route stamps the time. */
export interface ResolutionClaim {
  readonly sha: string;
  readonly note?: string;
}

/** A comment on its way to `POST /comments`, before the route names its author. */
export interface PostedComment {
  readonly branch: string;
  readonly body: string;
  readonly anchor: Anchor;
  /** ISO 8601, UTC. The store may overwrite it; it is not the client's to trust. */
  readonly createdAt: string;
  readonly context?: CommentContext;
  readonly attachments?: readonly MediaRef[];
}
