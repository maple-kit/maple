/**
 * The domain vocabulary every other module speaks.
 *
 * These types are the wire format: they cross the SDK route, land in a store
 * connector, and come back out in a ```maple fence. Changing a field here is a
 * breaking change for every connector, so fields are added, never repurposed.
 */

import type { Recipe } from "./mock/recipe.js";

/** A comment's position in the review lifecycle. */
export type CommentStatus = "open" | "resolved" | "needs_reverify" | "orphaned";

/** What a gate says about a surface. `neutral` is "I cannot tell", not "fine". */
export type GateConclusion = "blocked" | "clear" | "neutral";

/**
 * Why the gate reached its conclusion. A reason can be branched on; a summary
 * sentence cannot, and each neutral needs a different answer from a person.
 */
export type GateReason =
  | "all-resolved"
  | "approval-untracked"
  | "awaiting-approval"
  | "comments-open"
  | "no-comments"
  | "no-review"
  | "status-untracked"
  | "unreadable";

/** One gate decision about one commit. */
export interface GateVerdict {
  readonly conclusion: GateConclusion;
  readonly reason: GateReason;
  /** One line, for the check's own title. */
  readonly title: string;
  /** Markdown detail: which comments are open, numbered as the table numbers them. */
  readonly summary: string;
  /** Comments holding the gate. Zero whenever the conclusion is not `blocked`. */
  readonly open: number;
  /** Comments on the surface, whatever their status. */
  readonly total: number;
}

/**
 * A reviewer saying they looked at a preview and found nothing to say.
 *
 * It is the other half of the gate. A surface with no comments on it is
 * indistinguishable from a surface nobody opened, and a check that cannot tell
 * those apart reports green on both. An approval is what makes them different.
 */
export interface Approval {
  readonly id: string;
  /** Branch or pull request the approval is about, as a store lists them. */
  readonly branch: string;
  /**
   * The exact commit that was looked at. A push is a new preview, and an
   * approval outliving its commit is one that lies; `docs/gate.md` says more.
   */
  readonly commit: string;
  readonly author: CommentAuthor;
  /** ISO 8601, always UTC. Stamped where the write happens, never by a client. */
  readonly at: string;
  /** Whatever the reviewer wanted to say while approving. */
  readonly note?: string;
}

/** An approval on its way into a store, before the store assigns an id. */
export type NewApproval = Omit<Approval, "id">;

/** How confident Maple is that the author is who the comment says they are. */
export type IdentityProvenance = "server" | "client" | "guest";

/**
 * The three ways a reviewer says what a comment is about. It lives here rather
 * than beside the picker because the anchor reads it back off a stored
 * comment, and the client and the anchor cannot both own one word.
 */
export type PickKind = "element" | "region" | "text";

/** Where a comment was attached, most durable identifier first. */
export interface CommentAnchor {
  /** Value of `data-maple-key` when the application sets one on the element. */
  readonly key?: string;
  /** `path/to/file.tsx:line:col`, present only on builds that ran the tagger. */
  readonly source?: string;
  /** Component display name, from the tagger or the framework's own tree. */
  readonly component?: string;
  /** Text quote selector: the exact run plus surrounding context. */
  readonly quote?: TextQuote;
  /** CSS selector, the least durable fallback in the cascade. */
  readonly selector?: string;
  /** The rectangle a region pick drew, in fractions of the element above. */
  readonly region?: AnchorRegion;
}

/**
 * A rectangle, as fractions of the anchored element's border box. A region
 * comment is about an area that crosses several elements, so the element is
 * the box it is measured in rather than the thing it is about.
 */
export interface AnchorRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A W3C-style text quote selector, used to re-find a comment after a redeploy. */
export interface TextQuote {
  readonly exact: string;
  readonly prefix?: string;
  readonly suffix?: string;
  /** Character offset it was at. Breaks a tie; never trusted on its own. */
  readonly offset?: number;
}

/** A layout region that was open when the comment was written. */
export interface RegionContext {
  /** `dialog`, `complementary`, `navigation`, or the element's tag name. */
  readonly role: string;
  /** Accessible name, when it has one a reviewer would recognise. */
  readonly label?: string;
  /** Rendered width, so "the sidebar was open" carries a number. */
  readonly width: number;
}

/** Everything about the reviewer's environment that a fix might depend on. */
export interface CommentContext {
  readonly url: string;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  /**
   * `documentElement.clientWidth`: what the layout actually had, which the
   * window width does not say once a scrollbar or a panel takes space.
   */
  readonly contentWidth: number;
  readonly devicePixelRatio: number;
  readonly colorScheme: "light" | "dark";
  readonly locale?: string;
  readonly breakpoint?: string;
  /** Regions open at capture time, so "the sidebar was open" survives storage. */
  readonly regions?: readonly RegionContext[];
  /**
   * The mock in force when it was written: which calls, in which state, and
   * the sentence behind it. The recipe only, never a mocked response.
   */
  readonly mock?: Recipe;
}

/** The person who wrote a comment, as far as the identity connector could tell. */
export interface CommentAuthor {
  readonly id: string;
  readonly name: string;
  readonly avatarUrl?: string;
  readonly provenance: IdentityProvenance;
  /**
   * Which of the ten OKLCH reviewer hues to draw this author in, 0 to 9. The
   * route derives it from the id; absent for a guest, whose page assigns one.
   */
  readonly colorSlot?: number;
}

/** What an agent claims it did about a comment, kept with the comment itself. */
export interface CommentResolution {
  /** Commit the agent believes addresses the comment. */
  readonly sha: string;
  /** What changed, in the agent's words, for the reviewer re-checking it. */
  readonly note?: string;
  /** ISO 8601, always UTC. Stamped where the write happens, never by a client. */
  readonly at: string;
}

/** A stored comment, as a store connector hands it back. */
export interface Comment {
  readonly id: string;
  /**
   * Branch or pull request the comment belongs to. A store cannot place a
   * comment without it, so it travels with the comment rather than beside it.
   */
  readonly branch: string;
  /**
   * What a person calls this surface — a ticket, or a shortened branch. Read
   * in the branch's place; `branch` stays the identifier a store resolves.
   */
  readonly label?: string;
  /**
   * The commit the preview was serving when the comment was written. Exact
   * where a label is not, and the key a later re-verify compares against.
   */
  readonly commit?: string;
  readonly body: string;
  readonly status: CommentStatus;
  /** ISO 8601, always UTC. */
  readonly createdAt: string;
  readonly author: CommentAuthor;
  readonly anchor: CommentAnchor;
  readonly context: CommentContext;
  /** Media references resolved through a media connector. */
  readonly attachments?: readonly MediaRef[];
  /** Present once something claimed to resolve it; absent means never resolved. */
  readonly resolution?: CommentResolution;
  /**
   * Reserved for replies, which Maple does not ship: nothing sets it and
   * nothing reads it. `docs/replies.md` says what building them would cost.
   */
  readonly parentId?: string;
}

/** A comment on its way into a store, before the store assigns an id. */
export type NewComment = Omit<Comment, "id" | "status"> & {
  readonly status?: CommentStatus;
};

/** An opaque handle to a blob held by a media connector. */
export interface MediaRef {
  readonly connector: string;
  readonly key: string;
  readonly contentType: string;
  /**
   * Who put it there. Maple captures the page at pick time without being asked,
   * and a reader has no other way to tell that from an image the author chose.
   */
  readonly source?: MediaSource;
}

/** `capture` is Maple's own, at pick time; `offered` is a paste or a drop. */
export type MediaSource = "capture" | "offered";

/** A blob on its way into a media connector. */
export interface MediaBlob {
  readonly data: Uint8Array;
  readonly contentType: string;
  readonly filename?: string;
}

/** A person, as an identity connector resolved them. */
export interface MapleUser {
  readonly id: string;
  readonly name: string;
  readonly email?: string;
  readonly avatarUrl?: string;
}
