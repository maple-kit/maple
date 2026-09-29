/**
 * A store connector that keeps a branch's comments in `.maple/<branch>/comments.json`.
 *
 * For a laptop: plain JSON a person can read, diff and delete, no server and no
 * dependency. It is the wrong store for a preview pod, whose disk goes with the
 * pod, and for more than one writer at a time; `docs/connectors.md` says why.
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { readIfPresent, withLock, writeAtomic } from "./local-files.js";
import { resolveLocalPlace } from "./local-place.js";

import type {
  Approval,
  Comment,
  CommentResolution,
  CommentStatus,
  NewApproval,
  NewComment,
} from "../types.js";
import type { LocalPlaceOptions } from "./local-place.js";
import type { CommentPage, ListQuery, StoreConnector } from "./types.js";

/** Options for {@link fileStore}. */
export interface FileStoreOptions extends LocalPlaceOptions {
  /** Connector name reported to Maple. Defaults to `"file"`. */
  readonly name?: string;
}

/** What `comments.json` holds. `version` is there for the day the shape changes. */
interface Ledger {
  readonly version: 1;
  readonly comments: readonly Comment[];
  readonly approvals: readonly Approval[];
}

const EMPTY: Ledger = { version: 1, comments: [], approvals: [] };

function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

/** Cursors are the offset, encoded so callers cannot do arithmetic on them. */
function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): number {
  const offset = Number(Buffer.from(cursor, "base64url").toString("utf8"));
  if (!Number.isInteger(offset) || offset < 0) throw new RangeError(`Invalid cursor: ${cursor}`);
  return offset;
}

function parseLedger(text: string | undefined, path: string): Ledger {
  if (text === undefined) return EMPTY;
  try {
    const parsed = JSON.parse(text) as Partial<Ledger>;
    if (Array.isArray(parsed.comments)) {
      return { version: 1, comments: parsed.comments, approvals: parsed.approvals ?? [] };
    }
  } catch {
    // Falls through to the error below, which names the file.
  }
  throw new Error(
    `${path} is not a Maple comments file. Fix or delete it; Maple will not overwrite it.`,
  );
}

/** Creates a store connector backed by a JSON file under `.maple/`. */
export function fileStore(options: FileStoreOptions = {}): StoreConnector {
  async function file(): Promise<string> {
    return join((await resolveLocalPlace(options)).dir, "comments.json");
  }

  async function read(): Promise<Ledger> {
    const path = await file();
    return parseLedger(await readIfPresent(path), path);
  }

  /** One read-modify-write, serialised with every other on the same file. */
  async function change<T>(edit: (ledger: Ledger) => { ledger: Ledger; result: T }): Promise<T> {
    const path = await file();
    return withLock(path, async () => {
      const { ledger, result } = edit(parseLedger(await readIfPresent(path), path));
      await writeAtomic(path, `${JSON.stringify(ledger, null, 2)}\n`);
      return result;
    });
  }

  async function list(query: ListQuery): Promise<CommentPage> {
    if (query.limit !== undefined && query.limit <= 0) {
      throw new RangeError(`limit must be positive, received ${query.limit}`);
    }
    const matching = (await read()).comments.filter(
      (comment) =>
        comment.branch === query.branch &&
        (query.statuses === undefined || query.statuses.includes(comment.status)),
    );

    const offset = query.cursor === undefined ? 0 : decodeCursor(query.cursor);
    const page = matching.slice(offset, offset + (query.limit ?? matching.length));
    const next = offset + page.length;
    return {
      comments: page,
      ...(next < matching.length ? { cursor: encodeCursor(next) } : {}),
    };
  }

  function appendMany(incoming: readonly NewComment[]): Promise<readonly Comment[]> {
    return change((ledger) => {
      const stored = incoming.map((comment): Comment => ({
        ...comment,
        id: newId("loc"),
        status: comment.status ?? "open",
      }));
      return { ledger: { ...ledger, comments: [...ledger.comments, ...stored] }, result: stored };
    });
  }

  async function append(comment: NewComment): Promise<Comment> {
    return (await appendMany([comment]))[0]!;
  }

  function setStatus(
    id: string,
    status: CommentStatus,
    resolution?: CommentResolution,
  ): Promise<Comment> {
    return change((ledger) => {
      const existing = ledger.comments.find((comment) => comment.id === id);
      if (!existing) throw new Error(`No comment with id ${id}`);

      const updated: Comment = { ...existing, status, ...(resolution ? { resolution } : {}) };
      const comments = ledger.comments.map((comment) => (comment.id === id ? updated : comment));
      return { ledger: { ...ledger, comments }, result: updated };
    });
  }

  async function approvals(branch: string): Promise<readonly Approval[]> {
    return (await read()).approvals
      .filter((approval) => approval.branch === branch)
      .toSorted((a, b) => b.at.localeCompare(a.at));
  }

  function approve(approval: NewApproval): Promise<Approval> {
    return change((ledger) => {
      const stored: Approval = { ...approval, id: newId("app") };
      return { ledger: { ...ledger, approvals: [...ledger.approvals, stored] }, result: stored };
    });
  }

  function unapprove(id: string): Promise<void> {
    return change((ledger) => {
      if (!ledger.approvals.some((approval) => approval.id === id)) {
        throw new Error(`No approval with id ${id}`);
      }
      const approvals = ledger.approvals.filter((approval) => approval.id !== id);
      return { ledger: { ...ledger, approvals }, result: undefined };
    });
  }

  return {
    name: options.name ?? "file",
    list,
    append,
    appendMany,
    setStatus,
    approvals,
    approve,
    unapprove,
  };
}
