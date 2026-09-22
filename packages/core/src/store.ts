/**
 * The Promise-facing store API.
 *
 * Callers get retries, timeouts and one error type without knowing how any of
 * that is implemented. It covers every method of `StoreConnector`, so a
 * capability added there is added here too — `docs/connectors.md` is the rule.
 *
 * A capability the connector lacks surfaces as an absent value, never an empty
 * one; `capabilities` is the only thing that says which it was.
 */

import { assertUsable, capabilitiesOf } from "./connectors/capabilities.js";
import {
  appendComment,
  appendComments,
  approveSurface,
  headCommit,
  listApprovals,
  listComments,
  setCommentStatus,
  unapproveSurface,
  watchComments,
} from "./internal/effect/store.js";

import type { CapabilityReport } from "./connectors/capabilities.js";
import type { CommentPage, ListQuery, StoreConnector } from "./connectors/types.js";
import type {
  Approval,
  Comment,
  CommentResolution,
  CommentStatus,
  NewApproval,
  NewComment,
} from "./types.js";

/**
 * A store connector with Maple's reliability behaviour wrapped around it.
 *
 * Every method is present whatever the connector implements; `capabilities`
 * reports what it can do and the return value reports what happened.
 */
export interface CommentStore {
  readonly name: string;
  readonly capabilities: CapabilityReport<"store">;
  list(query: ListQuery): Promise<CommentPage>;
  append(comment: NewComment): Promise<Comment>;
  /** One write where the connector takes a batch, one call each where not. */
  appendMany(comments: readonly NewComment[]): Promise<readonly Comment[]>;
  /** Resolves to null when the connector cannot change status. */
  setStatus(
    id: string,
    status: CommentStatus,
    resolution?: CommentResolution,
  ): Promise<Comment | null>;
  /** The head commit, or undefined for a connector that cannot name one. */
  head(branch: string): Promise<string | undefined>;
  /** Undefined where the connector cannot long-poll; an empty page is a quiet window. */
  watch(query: ListQuery, signal: AbortSignal): Promise<CommentPage | undefined>;
  /** Undefined is "this store keeps none", which a gate reads as neutral. */
  approvals(branch: string): Promise<readonly Approval[] | undefined>;
  /** Resolves to null when the connector keeps no approvals. */
  approve(approval: NewApproval): Promise<Approval | null>;
  /** False when the connector cannot withdraw one. */
  unapprove(id: string): Promise<boolean>;
}

/**
 * Wraps a store connector for use by the rest of Maple.
 *
 * @throws {MissingCapabilityError} when the connector lacks `list` or `append`.
 */
export function createCommentStore(connector: StoreConnector): CommentStore {
  assertUsable("store", connector);

  return {
    name: connector.name,
    capabilities: capabilitiesOf("store", connector),
    list: (query) => listComments(connector, query),
    append: (comment) => appendComment(connector, comment),
    appendMany: (comments) => appendComments(connector, comments),
    setStatus: (id, status, resolution) => setCommentStatus(connector, id, status, resolution),
    head: (branch) => headCommit(connector, branch),
    watch: (query, signal) => watchComments(connector, query, signal),
    approvals: (branch) => listApprovals(connector, branch),
    approve: (approval) => approveSurface(connector, approval),
    unapprove: (id) => unapproveSurface(connector, id),
  };
}
