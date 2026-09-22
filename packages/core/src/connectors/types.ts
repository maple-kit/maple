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
  Approval,
  Comment,
  CommentResolution,
  CommentStatus,
  GateVerdict,
  MapleUser,
  MediaBlob,
  MediaRef,
  NewApproval,
  NewComment,
} from "../types.js";

/** The six kinds of backend Maple knows how to talk to. */
export type ConnectorKind =
  "classifier" | "gate" | "identity" | "media" | "observability" | "store";

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
 * Its `resolution` records what claimed to address the comment; a store that
 * cannot keep it stores the status alone rather than refusing the call.
 */
export interface StoreConnector extends ConnectorMeta {
  list(query: ListQuery): Promise<CommentPage>;
  append(comment: NewComment): Promise<Comment>;
  setStatus?(id: string, status: CommentStatus, resolution?: CommentResolution): Promise<Comment>;
  /**
   * The commit a surface points at now, or undefined where the backend cannot
   * say. A gate is about a commit, never a branch; `docs/gate.md` says why.
   */
  head?(branch: string): Promise<string | undefined>;
  /** Long-poll for comments newer than `cursor`. Resolves empty on timeout. */
  watch?(query: ListQuery, signal: AbortSignal): Promise<CommentPage>;
  /**
   * Approvals on a surface, newest first. Present together with `approve`: one
   * that records what it cannot read back records nothing a gate can act on.
   */
  approvals?(branch: string): Promise<readonly Approval[]>;
  /** Records one. The store assigns the id; everything else is given. */
  approve?(approval: NewApproval): Promise<Approval>;
  /** Takes one back. Optional even where `approve` is present. */
  unapprove?(id: string): Promise<void>;
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

/**
 * Publishes whether a commit is clear to merge. The verdict is decided by
 * `decideGate` in `@maple-kit/core/gate`; a gate connector only says it.
 */
export interface GateConnector extends ConnectorMeta {
  publish(report: GateReport): Promise<void>;
  /** What the gate currently says, where the forge can be read back. */
  read?(target: GateTarget): Promise<GateVerdict | undefined>;
}

/** The commit a verdict is about. A gate is never about a branch alone. */
export interface GateTarget {
  /** Branch or pull-request identifier, the same one a store lists by. */
  readonly branch: string;
  /** The exact head commit, so a new push is a new decision. */
  readonly sha: string;
}

/** A verdict on its way to a forge. */
export interface GateReport extends GateTarget {
  readonly verdict: GateVerdict;
  /** Where a reviewer goes to resolve the comments, usually the preview. */
  readonly reviewUrl?: string;
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

/**
 * Judges a comment as it is written: how well it reads against each pillar,
 * and what kind of comment it looks like. Both methods are optional, so a
 * backend that can only do one of the two is used for that one.
 *
 * Every judgement is advice. Nothing here blocks, gates, delays or rewrites a
 * send, and `docs/assist.md` is the design record for why.
 */
export interface ClassifierConnector extends ConnectorMeta {
  /**
   * The dimensions it scores against, in the order a surface shows them, and
   * empty when it only classifies. Configuration, not a capability claim.
   */
  readonly pillars: readonly Pillar[];
  /** Scores a comment. Rejects a pillar id it was never configured with. */
  score?(request: ScoreRequest): Promise<readonly PillarScore[]>;
  /** Guesses what kind of comment this is, from the text alone. */
  classify?(request: ClassifierRequest): Promise<KindGuess>;
}

/**
 * One dimension a comment is judged on — "specific", "concise" — with the
 * ordered levels it is judged against. The host configures the set; a
 * reviewer never does, because a pillar a reviewer can move measures nothing.
 */
export interface Pillar {
  /** Stable id, used in configuration, in a {@link PillarScore} and in an eval case. */
  readonly id: string;
  /** The judgement a classifier is asked to make, in one sentence. */
  readonly instruction: string;
  /** Ordered worst to best. Each level describes a concrete comment. */
  readonly levels: readonly PillarLevel[];
}

/** One rung of a pillar's ladder. */
export interface PillarLevel {
  /** Two or three words, short enough to sit under a field. */
  readonly label: string;
  /** The situation this rung describes, complete enough to judge against. */
  readonly description: string;
}

/**
 * Where one comment sits on one pillar.
 *
 * It carries the distribution and the confidence as well as the level,
 * because a level on its own cannot say how nearly it was a different level —
 * and a surface that cannot say that presents a guess as a fact.
 */
export interface PillarScore {
  /** The {@link Pillar.id} this is about. */
  readonly pillar: string;
  /** Index into that pillar's levels: the rung the comment reached. */
  readonly level: number;
  /** Probability per level, in the pillar's own order. Sums to one. */
  readonly distribution: readonly number[];
  /** How concentrated that distribution is, from zero to one. */
  readonly confidence: number;
}

/** What a comment looks like it is. `other` is an absence, never a verdict. */
export type CommentKind = "bug" | "copy" | "other" | "praise" | "question" | "request";

/** A guess at a comment's kind, carrying the spread that produced it. */
export interface KindGuess {
  /** The kind that took the most probability. */
  readonly kind: CommentKind;
  /** Probability per kind. Sums to one. */
  readonly distribution: Readonly<Record<CommentKind, number>>;
  /** How concentrated that distribution is, from zero to one. */
  readonly confidence: number;
}

/**
 * What a classifier is given. The comment text and nothing else: two of the
 * pillars ask whether it reads without the page in front of you, and handing
 * the classifier the anchor would hide exactly what they measure.
 */
export interface ClassifierRequest {
  /** The comment as it stands, which while typing is usually mid-sentence. */
  readonly body: string;
  /**
   * Abandons the judgement when the next keystroke makes it stale. A
   * connector reaching a network honours it; a local one may ignore it.
   */
  readonly signal?: AbortSignal;
}

/** A scoring request, optionally narrowed to some of the pillars. */
export interface ScoreRequest extends ClassifierRequest {
  /** Which pillars to score, by id. Defaults to every configured pillar. */
  readonly pillars?: readonly string[];
}

/** Any connector, whatever its kind. */
export type AnyConnector =
  | ClassifierConnector
  | GateConnector
  | IdentityConnector
  | MediaConnector
  | ObservabilityConnector
  | StoreConnector;
