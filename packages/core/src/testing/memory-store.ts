/**
 * A store connector that keeps everything in a Map.
 *
 * It exists so the contract suite has a reference to run against, and so a
 * contributor can see the smallest thing that satisfies the contract before
 * writing one against a real backend. It is not exported from the package root
 * and is not meant for production.
 */

import type { CommentPage, ListQuery, StoreConnector } from "../connectors/types.js";
import type { Comment, CommentStatus, NewComment } from "../types.js";

/** Options for {@link memoryStore}. */
export interface MemoryStoreOptions {
  /** Connector name reported to Maple. Defaults to `"memory"`. */
  readonly name?: string;
  /** Omit `setStatus`, to exercise the append-only path. Defaults to false. */
  readonly appendOnly?: boolean;
}

/** Cursors are just the offset, encoded so callers cannot do arithmetic on them. */
function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

/** Reads an offset back out of a cursor, rejecting anything malformed. */
function decodeCursor(cursor: string): number {
  const offset = Number(Buffer.from(cursor, "base64url").toString("utf8"));
  if (!Number.isInteger(offset) || offset < 0) throw new RangeError(`Invalid cursor: ${cursor}`);
  return offset;
}

/** The branch a comment belongs to, taken from its anchor key. */
function branchOf(comment: Comment): string | undefined {
  return comment.anchor.key;
}

/** Creates an in-memory store connector. */
export function memoryStore(options: MemoryStoreOptions = {}): StoreConnector {
  const comments = new Map<string, Comment>();
  let nextId = 1;

  function list(query: ListQuery): Promise<CommentPage> {
    if (query.limit !== undefined && query.limit <= 0) {
      return Promise.reject(new RangeError(`limit must be positive, received ${query.limit}`));
    }

    const matching = [...comments.values()].filter(
      (comment) =>
        branchOf(comment) === query.branch &&
        (query.statuses === undefined || query.statuses.includes(comment.status)),
    );

    const offset = query.cursor === undefined ? 0 : decodeCursor(query.cursor);
    const limit = query.limit ?? matching.length;
    const page = matching.slice(offset, offset + limit);
    const next = offset + page.length;

    return Promise.resolve({
      comments: page,
      ...(next < matching.length ? { cursor: encodeCursor(next) } : {}),
    });
  }

  function append(comment: NewComment): Promise<Comment> {
    const stored: Comment = { ...comment, id: `mem_${nextId++}`, status: comment.status ?? "open" };
    comments.set(stored.id, stored);
    return Promise.resolve(stored);
  }

  function setStatus(id: string, status: CommentStatus): Promise<Comment> {
    const existing = comments.get(id);
    if (!existing) return Promise.reject(new Error(`No comment with id ${id}`));

    const updated: Comment = { ...existing, status };
    comments.set(id, updated);
    return Promise.resolve(updated);
  }

  return {
    name: options.name ?? "memory",
    list,
    append,
    ...(options.appendOnly === true ? {} : { setStatus }),
  };
}
