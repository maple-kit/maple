/**
 * Comments a reviewer started and has not sent.
 *
 * Kept per branch, because a preview host is per branch and a draft written
 * against one deploy means nothing on another. Storage is best-effort: it
 * throws in a private window and when a browser blocks site data, so every
 * access is guarded and the store falls back to memory rather than taking the
 * overlay down with it.
 */

import type { Anchor } from "../anchor/types.js";
import type { Logger } from "../logger/types.js";
import type { PageContext } from "./context.js";

/** An unsent comment. */
export interface Draft {
  readonly id: string;
  readonly body: string;
  readonly anchor: Anchor;
  readonly context?: PageContext;
  /** ISO 8601, UTC. */
  readonly updatedAt: string;
}

/** Drafts for one branch. */
export interface DraftStore {
  /** Newest first. */
  list(): Draft[];
  save(draft: Draft): void;
  remove(id: string): void;
  clear(): void;
}

/** How the store is scoped and where it writes. */
export interface DraftStoreOptions {
  /** Branch or pull request the drafts belong to. */
  readonly branch: string;
  /** Defaults to `localStorage`. Anything Storage-shaped works. */
  readonly storage?: Storage;
  /** Where a storage failure is reported. Silent when absent. */
  readonly logger?: Logger;
}

const PREFIX = "maple:drafts:";

/** Opens the draft store for a branch. */
export function createDraftStore(options: DraftStoreOptions): DraftStore {
  const key = PREFIX + options.branch;
  const storage = resolve(options);
  const memory = new Map<string, Draft>(read(storage, key, options.logger));

  const flush = (): void => {
    write(storage, key, [...memory.values()], options.logger);
  };

  return {
    list: () => [...memory.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    save: (draft) => {
      memory.set(draft.id, draft);
      flush();
    },
    remove: (id) => {
      memory.delete(id);
      flush();
    },
    clear: () => {
      memory.clear();
      flush();
    },
  };
}

/**
 * `localStorage` can throw on access, not only on use, so reaching it is
 * itself guarded and an unreachable one becomes a memory-backed stand-in.
 */
function resolve(options: DraftStoreOptions): Storage | undefined {
  if (options.storage) return options.storage;
  try {
    return globalThis.localStorage;
  } catch {
    options.logger?.warn("Drafts are memory-only: this browser blocks site data.");
    return undefined;
  }
}

function read(
  storage: Storage | undefined,
  key: string,
  logger: Logger | undefined,
): Array<[string, Draft]> {
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return (parsed as Draft[]).filter(isDraft).map((draft) => [draft.id, draft]);
  } catch (error) {
    logger?.warn("Discarded unreadable drafts.", { key, error: String(error) });
    return [];
  }
}

function write(
  storage: Storage | undefined,
  key: string,
  drafts: readonly Draft[],
  logger: Logger | undefined,
): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(drafts));
  } catch (error) {
    logger?.warn("Could not save drafts; they are kept in memory only.", {
      key,
      error: String(error),
    });
  }
}

function isDraft(value: unknown): value is Draft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Partial<Draft>;
  return typeof draft.id === "string" && typeof draft.body === "string" && !!draft.anchor;
}
