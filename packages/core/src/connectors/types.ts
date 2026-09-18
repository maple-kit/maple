/**
 * The connector contract. This file is the whole public API a contributor
 * implements, and it is deliberately plain: Promises, structural types, no
 * framework. Core wraps whatever lands here in its own machinery.
 *
 * Optional methods are the capability system. A connector implements the
 * methods its backend can honour and omits the rest; nothing declares
 * capabilities twice.
 */

import type {
  Comment,
  CommentStatus,
  MapleUser,
  MediaBlob,
  MediaRef,
  NewComment,
} from "../types.js";

/** The four kinds of backend Maple knows how to talk to. */
export type ConnectorKind = "store" | "media" | "observability" | "identity";

/** Fields every connector carries, whatever its kind. */
export interface ConnectorMeta {
  /** Stable lowercase id used in config, docs and `MediaRef.connector`. */
  readonly name: string;
}

/** Narrows a listing to one review surface. */
export interface ListQuery {
  /** Branch or pull-request identifier the comments belong to. */
  readonly branch: string;
  /** Opaque token from a previous page; omit for the first page. */
  readonly cursor?: string;
  /** Upper bound on returned comments. A connector may return fewer. */
  readonly limit?: number;
  /** When set, only comments in these states are returned. */
  readonly statuses?: readonly CommentStatus[];
}

/** One page of comments plus the cursor that continues it. */
export interface CommentPage {
  readonly comments: readonly Comment[];
  /** Absent when this is the last page. */
  readonly cursor?: string;
}

/**
 * Reads and writes comments. The only connector kind Maple cannot run without.
 *
 * `setStatus` is optional because append-only backends exist; where it is
 * missing, Maple keeps status client-side and the CI gate degrades to neutral.
 */
export interface StoreConnector extends ConnectorMeta {
  list(query: ListQuery): Promise<CommentPage>;
  append(comment: NewComment): Promise<Comment>;
  setStatus?(id: string, status: CommentStatus): Promise<Comment>;
  /** Long-poll for comments newer than `cursor`. Resolves empty on timeout. */
  watch?(query: ListQuery, signal: AbortSignal): Promise<CommentPage>;
}

/** Stores screenshots and other binary evidence. */
export interface MediaConnector extends ConnectorMeta {
  putBlob(blob: MediaBlob): Promise<MediaRef>;
  /** A URL a reviewer's browser can load, signed where the backend requires it. */
  getUrl(ref: MediaRef): Promise<string>;
  remove?(ref: MediaRef): Promise<void>;
}

/** Points at what a session-replay vendor recorded around a comment. */
export interface ObservabilityConnector extends ConnectorMeta {
  /** Deep link into the replay, or null when the session was not recorded. */
  getReplayLink(query: ReplayQuery): Promise<string | null>;
  /** Raw session events, where the vendor exposes them. */
  fetchEvents?(query: ReplayQuery): Promise<readonly ReplayEvent[]>;
}

/** Identifies the moment a comment was written. */
export interface ReplayQuery {
  readonly sessionId: string;
  /** Milliseconds since the Unix epoch. */
  readonly at: number;
  readonly viewId?: string;
}

/** One event from a replay timeline, normalised across vendors. */
export interface ReplayEvent {
  readonly type: string;
  readonly at: number;
  readonly detail?: Readonly<Record<string, unknown>>;
}

/** Answers "who is making this request?" from the host application's session. */
export interface IdentityConnector extends ConnectorMeta {
  /** Null when the request carries no session; Maple then offers the guest flow. */
  resolveUser(request: IdentityRequest): Promise<MapleUser | null>;
}

/** The parts of an incoming request an identity connector is allowed to see. */
export interface IdentityRequest {
  readonly headers: Readonly<Record<string, string>>;
  readonly url: string;
}

/** Any connector, whatever its kind. */
export type AnyConnector =
  IdentityConnector | MediaConnector | ObservabilityConnector | StoreConnector;
