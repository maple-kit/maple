/**
 * Keeping an unsent comment, across a keystroke, a reload and another tab.
 *
 * Writes are debounced so a fast typist does not serialise the whole list on
 * every character, and forced before anything that could end the page. A sent
 * draft leaves a tombstone: without one, a tab still holding it in memory
 * writes it back and the reviewer is handed a comment they already posted.
 * Drafts older than a week are dropped per branch, because a preview that old
 * is gone and the draft points at nothing.
 */

import { fnv1a32 } from "../lib/fnv1a.js";
import { stableStringify } from "../lib/stable-stringify.js";
import { createDraftStore } from "../overlay/drafts.js";

import type { Anchor } from "../anchor/types.js";
import type { Logger } from "../logger/types.js";
import type { Draft, DraftStore } from "../overlay/drafts.js";
import type { DraftImportResult, ForeignDrafts } from "./transfer.js";

/** How long a keystroke waits before it reaches storage. */
export const DRAFT_DEBOUNCE_MS = 400;

/** How long a draft outlives its last edit. */
export const DRAFT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

const DRAFTS_PREFIX = "maple:drafts:";
const SENT_PREFIX = "maple:sent:";
const DISMISSED_PREFIX = "maple:dismissed:";

/** How the keeper is scoped and where it writes. */
export interface DraftKeeperOptions {
  readonly branch: string;
  /** Defaults to `localStorage`, reached behind a guard. */
  readonly storage?: Storage;
  readonly logger?: Logger;
  /** Milliseconds since the epoch. Injectable so expiry is testable. */
  readonly now?: () => number;
  /** Defaults to {@link DRAFT_DEBOUNCE_MS}. */
  readonly debounceMs?: number;
}

/** Drafts for one branch, with the write scheduling around them. */
export interface DraftKeeper {
  /** Newest first. */
  list(): readonly Draft[];
  get(id: string): Draft | undefined;
  /** The draft already left on this anchor, when there is one. */
  find(anchor: Anchor): Draft | undefined;
  /** Records the draft and schedules the write. */
  save(draft: Draft): void;
  /** Writes anything pending now. Cheap when nothing is. */
  flush(): void;
  /**
   * True while a reload would lose a draft: a save still inside its debounce
   * window, or drafts held only in memory because storage is blocked.
   */
  atRisk(): boolean;
  /** Forgets a draft the reviewer threw away. */
  discard(id: string): void;
  /** Forgets a draft that became a comment, and remembers that it did. */
  markSent(id: string): void;
  /**
   * Saves drafts that came from elsewhere, as they are. Skips an id already
   * here or sent from here, and one too old to survive the next load.
   */
  importDrafts(drafts: readonly Draft[]): DraftImportResult;
  /** Other branches' keys on this origin that still hold live drafts. */
  foreign(): readonly ForeignDrafts[];
  /** Brings another branch's live drafts here and empties its key. */
  adopt(branch: string): DraftImportResult;
  /** Stops offering another branch's drafts until one newer appears. */
  dismiss(branch: string): void;
  /** Re-reads storage after another tab wrote to it. */
  reconcile(): void;
  /** True when a `storage` event's key belongs to this branch. */
  owns(key: string | null): boolean;
  subscribe(listener: () => void): () => void;
  destroy(): void;
}

/**
 * A draft's id: the branch is the store, the anchor is in the id, and the
 * timestamp separates two drafts left on the same element.
 */
export function draftIdFor(anchor: Anchor, at: number): string {
  return `${anchorKey(anchor)}-${at.toString(36)}`;
}

/** The part of a draft id that says which anchor it belongs to. */
function anchorKey(anchor: Anchor): string {
  return fnv1a32(stableStringify(anchor)).toString(36);
}

/** Opens the keeper. Reaches storage once, behind a guard, and never again. */
export function createDraftKeeper(options: DraftKeeperOptions): DraftKeeper {
  const storage = reach(options);
  const now = options.now ?? Date.now;
  const wait = options.debounceMs ?? DRAFT_DEBOUNCE_MS;
  const listeners = new Set<() => void>();

  let store = prune(openStore(options, storage), storage, options.branch, now());
  let pending: Draft | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const announce = (): void => {
    for (const listener of listeners) listener();
  };

  const flush = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (!pending) return;
    store.save(pending);
    pending = undefined;
    announce();
  };

  const all = (): readonly Draft[] => (pending ? merge(store.list(), pending) : store.list());

  const importDrafts = (drafts: readonly Draft[]): DraftImportResult => {
    const held = new Set(all().map((draft) => draft.id));
    const sent = sentIds(storage, options.branch, now());
    let [added, skipped, expired] = [0, 0, 0];
    for (const draft of drafts) {
      if (held.has(draft.id) || sent.has(draft.id)) skipped += 1;
      else if (isStale(draft, now())) expired += 1;
      else {
        store.save(draft);
        held.add(draft.id);
        added += 1;
      }
    }
    if (added > 0) announce();
    return { added, skipped, expired, invalid: 0 };
  };

  return {
    list: all,
    get: (id) => all().find((draft) => draft.id === id),
    find: (anchor) => all().find((draft) => draft.id.startsWith(`${anchorKey(anchor)}-`)),
    save(draft) {
      pending = draft;
      if (timer === undefined) timer = setTimeout(flush, wait);
      announce();
    },
    flush,
    atRisk: () => pending !== undefined || (storage === undefined && all().length > 0),
    discard(id) {
      if (pending?.id === id) pending = undefined;
      flush();
      store.remove(id);
      announce();
    },
    markSent(id) {
      if (pending?.id === id) pending = undefined;
      flush();
      store.remove(id);
      remember(storage, options.branch, { id, at: now() }, options.logger);
      announce();
    },
    importDrafts,
    foreign: () => foreignBranches(storage, options.branch, now()),
    adopt(branch) {
      const result = importDrafts(liveDrafts(storage, branch, now()));
      if (storage) createDraftStore({ branch, storage }).clear();
      return result;
    },
    dismiss(branch) {
      dismissForeign(storage, options.branch, branch, now());
    },
    reconcile() {
      store = prune(openStore(options, storage), storage, options.branch, now());
      if (pending && !alive(storage, options.branch, pending.id, now())) pending = undefined;
      announce();
    },
    owns: (key) => key === DRAFTS_PREFIX + options.branch || key === SENT_PREFIX + options.branch,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      flush();
      listeners.clear();
    },
  };
}

function openStore(options: DraftKeeperOptions, storage: Storage | undefined): DraftStore {
  return createDraftStore({
    branch: options.branch,
    ...(storage === undefined ? {} : { storage }),
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  });
}

/** Drops what another tab sent and what is older than a week, in one pass. */
function prune(
  store: DraftStore,
  storage: Storage | undefined,
  branch: string,
  at: number,
): DraftStore {
  const sent = sentIds(storage, branch, at);
  for (const draft of store.list()) {
    if (sent.has(draft.id) || isStale(draft, at)) store.remove(draft.id);
  }
  return store;
}

function isStale(draft: Draft, at: number): boolean {
  return at - Date.parse(draft.updatedAt) > DRAFT_LIFETIME_MS;
}

/** What another branch's key holds that a reload here would still keep. */
function liveDrafts(storage: Storage | undefined, branch: string, at: number): readonly Draft[] {
  if (!storage) return [];
  const sent = sentIds(storage, branch, at);
  return createDraftStore({ branch, storage })
    .list()
    .filter((draft) => !sent.has(draft.id) && !isStale(draft, at));
}

/** Every branch but this one with something live under its key, undismissed. */
function foreignBranches(
  storage: Storage | undefined,
  own: string,
  at: number,
): readonly ForeignDrafts[] {
  const dismissed = dismissals(storage, own);
  return storedBranches(storage)
    .filter((branch) => branch !== own)
    .flatMap((branch) => {
      const live = liveDrafts(storage, branch, at);
      const latest = newest(live);
      const hidden = latest !== undefined && latest <= (dismissed[branch] ?? "");
      return live.length === 0 || hidden ? [] : [{ branch, count: live.length }];
    });
}

function storedBranches(storage: Storage | undefined): readonly string[] {
  if (!storage) return [];
  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    return keys.flatMap((key) =>
      key?.startsWith(DRAFTS_PREFIX) ? [key.slice(DRAFTS_PREFIX.length)] : [],
    );
  } catch {
    return [];
  }
}

/** The latest edit among drafts, which is what a dismissal is remembered against. */
function newest(drafts: readonly Draft[]): string | undefined {
  return drafts
    .map((draft) => draft.updatedAt)
    .sort((a, b) => a.localeCompare(b))
    .at(-1);
}

function dismissals(storage: Storage | undefined, own: string): Record<string, string> {
  if (!storage) return {};
  try {
    const parsed: unknown = JSON.parse(storage.getItem(DISMISSED_PREFIX + own) ?? "{}");
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function dismissForeign(
  storage: Storage | undefined,
  own: string,
  branch: string,
  at: number,
): void {
  const latest = newest(liveDrafts(storage, branch, at));
  if (!storage || latest === undefined) return;
  try {
    const kept = { ...dismissals(storage, own), [branch]: latest };
    storage.setItem(DISMISSED_PREFIX + own, JSON.stringify(kept));
  } catch {
    // Unwritable storage means the row comes back next time, which is harmless.
  }
}

function alive(storage: Storage | undefined, branch: string, id: string, at: number): boolean {
  return !sentIds(storage, branch, at).has(id);
}

/**
 * `localStorage` throws on access, not only on use, so reaching it is itself
 * guarded and an unreachable one leaves the keeper memory-backed.
 */
function reach(options: DraftKeeperOptions): Storage | undefined {
  if (options.storage) return options.storage;
  try {
    return globalThis.localStorage;
  } catch {
    options.logger?.warn("Drafts are memory-only: this browser blocks site data.");
    return undefined;
  }
}

interface Tombstone {
  readonly id: string;
  readonly at: number;
}

function sentIds(storage: Storage | undefined, branch: string, at: number): Set<string> {
  return new Set(tombstones(storage, branch, at).map((entry) => entry.id));
}

function tombstones(
  storage: Storage | undefined,
  branch: string,
  at: number,
): readonly Tombstone[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SENT_PREFIX + branch) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return (parsed as Tombstone[]).filter(
      (entry) => typeof entry?.id === "string" && at - entry.at <= DRAFT_LIFETIME_MS,
    );
  } catch {
    return [];
  }
}

function remember(
  storage: Storage | undefined,
  branch: string,
  entry: Tombstone,
  logger: Logger | undefined,
): void {
  if (!storage) return;
  const kept = [...tombstones(storage, branch, entry.at), entry];
  try {
    storage.setItem(SENT_PREFIX + branch, JSON.stringify(kept));
  } catch (error) {
    logger?.warn("Could not record a sent draft; another tab may offer it again.", {
      branch,
      error: String(error),
    });
  }
}

function merge(saved: readonly Draft[], pending: Draft): readonly Draft[] {
  return [pending, ...saved.filter((draft) => draft.id !== pending.id)];
}
