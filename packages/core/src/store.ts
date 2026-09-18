/**
 * The Promise-facing store API.
 *
 * Callers get retries, timeouts and one error type without knowing how any of
 * that is implemented. Capability gaps surface as `null`, never as a throw, so
 * an append-only backend degrades instead of breaking.
 */

import { assertUsable, capabilitiesOf } from "./connectors/capabilities.js";
import { appendComment, listComments, setCommentStatus } from "./internal/effect/store.js";

import type { CapabilityReport } from "./connectors/capabilities.js";
import type { CommentPage, ListQuery, StoreConnector } from "./connectors/types.js";
import type { Comment, CommentStatus, NewComment } from "./types.js";

/** A store connector with Maple's reliability behaviour wrapped around it. */
export interface CommentStore {
  readonly name: string;
  readonly capabilities: CapabilityReport<"store">;
  list(query: ListQuery): Promise<CommentPage>;
  append(comment: NewComment): Promise<Comment>;
  /** Resolves to null when the connector cannot change status. */
  setStatus(id: string, status: CommentStatus): Promise<Comment | null>;
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
    setStatus: (id, status) => setCommentStatus(connector, id, status),
  };
}
