/**
 * The domain vocabulary every other module speaks.
 *
 * These types are the wire format: they cross the SDK route, land in a store
 * connector, and come back out in a ```maple fence. Changing a field here is a
 * breaking change for every connector, so fields are added, never repurposed.
 */

/** A comment's position in the review lifecycle. */
export type CommentStatus = "open" | "resolved" | "needs_reverify" | "orphaned";

/** How confident Maple is that the author is who the comment says they are. */
export type IdentityProvenance = "server" | "client" | "guest";

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
}

/** A W3C-style text quote selector, used to re-find a comment after a redeploy. */
export interface TextQuote {
  readonly exact: string;
  readonly prefix?: string;
  readonly suffix?: string;
}

/** Everything about the reviewer's environment that a fix might depend on. */
export interface CommentContext {
  readonly url: string;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly devicePixelRatio: number;
  readonly colorScheme: "light" | "dark";
  readonly locale?: string;
  readonly breakpoint?: string;
}

/** The person who wrote a comment, as far as the identity connector could tell. */
export interface CommentAuthor {
  readonly id: string;
  readonly name: string;
  readonly avatarUrl?: string;
  readonly provenance: IdentityProvenance;
}

/** A stored comment, as a store connector hands it back. */
export interface Comment {
  readonly id: string;
  readonly body: string;
  readonly status: CommentStatus;
  /** ISO 8601, always UTC. */
  readonly createdAt: string;
  readonly author: CommentAuthor;
  readonly anchor: CommentAnchor;
  readonly context: CommentContext;
  /** Media references resolved through a media connector. */
  readonly attachments?: readonly MediaRef[];
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
}

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
