/**
 * The reviewer state machine: the only place the model lives.
 *
 * A plain object with `subscribe` and imperative methods, so a React,
 * Svelte or Astro binding is a `useSyncExternalStore` call over it and nothing
 * more. It touches no DOM until `start()`, which is what lets every rule in
 * here — the filters, the counts, the draft's life, the shortcut's modifier
 * guard — be tested without a browser.
 */

import { labelFor } from "../anchor/label.js";
import { createDraftKeeper, draftIdFor } from "./drafts.js";
import { openCount, visibleComments } from "./filters.js";
import { createNavigationGuard } from "./navigation.js";
import { readMapleConfig, writePreferences } from "./preferences.js";
import { opensComposer } from "./shortcut.js";
import { themeFrom, watchTheme } from "./theme.js";
import { createTransport } from "./transport.js";

import type { Logger } from "../logger/types.js";
import type { Draft } from "../overlay/drafts.js";
import type { Comment, CommentStatus, MediaRef } from "../types.js";
import type { DraftKeeper } from "./drafts.js";
import type {
  LeaveAnswer,
  LeavePrompt,
  LeaveQuestion,
  LeaveReason,
  LeaveSubject,
  NavigationGuard,
  NavigationView,
} from "./navigation.js";
import type { MapleConfig, MapleProps } from "./preferences.js";
import type { ThemeView, ThemeWatch } from "./theme.js";
import type { Transport } from "./transport.js";
import type {
  ClientState,
  CommentFilter,
  ComposerState,
  ComposerTarget,
  Corner,
  Detail,
  PickKind,
  PickState,
  PostedComment,
  ResolutionClaim,
  ThemePreference,
} from "./types.js";

/** Everything the controller attaches to. `window` satisfies it. */
export type ClientView = NavigationView & ThemeView;

/** How the controller is built. Every field has a working default. */
export interface MapleClientOptions extends MapleProps {
  readonly branch: string;
  /** Where the SDK route is mounted. Defaults to `/api/maple`. */
  readonly basePath?: string;
  /** Injectable so a test drives the route without reaching for a global. */
  readonly fetch?: typeof globalThis.fetch;
  /** Defaults to `localStorage`, reached behind a guard. */
  readonly storage?: Storage;
  readonly logger?: Logger;
  /** Milliseconds since the epoch. Injectable so expiry is testable. */
  readonly now?: () => number;
  /** How long a keystroke waits before it reaches storage. */
  readonly debounceMs?: number;
  /** What the theme is read from. Defaults to the document element. */
  readonly root?: Element;
  /** What listeners attach to. Defaults to `globalThis.window`. */
  readonly view?: ClientView;
  /** Let the browser ask before a hard exit. Off: the draft is already safe. */
  readonly confirmOnUnload?: boolean;
  /**
   * Already resolved by `readMapleConfig`, so the query string, the viewer's
   * stored preference and the props are read once rather than once per surface.
   */
  readonly config?: MapleConfig;
  /** Which origin a preference belongs to. Defaults to the page's own. */
  readonly origin?: string;
  /** Called after a draft was saved on the way out of the page. */
  onLeave?(reason: LeaveReason): void;
  /**
   * Asked once per draft before a link takes the page away, so the surface can
   * offer Keep writing / Discard. Left out, the guard saves and lets it go.
   */
  askToLeave?(question: LeaveQuestion): LeaveAnswer | Promise<LeaveAnswer>;
}

/** The controller. A binding reads `subscribe` and calls the rest. */
export interface MapleClient {
  getState(): ClientState;
  /** Returns the unsubscribe. The state object is replaced whole on a change. */
  subscribe(listener: (state: ClientState) => void): () => void;
  /** Attaches the navigation guard, the theme watch, the shortcut and storage. */
  start(): void;
  destroy(): void;

  /** Loads the branch's comments and asks the route who the reviewer is. */
  load(): Promise<void>;
  setFilter(filter: CommentFilter): void;
  setShowResolved(show: boolean): void;
  /** Presentation only, and remembered per origin. Nothing is recorded by it. */
  setDetail(detail: Detail): void;
  /**
   * What the overlay is drawn in. Remembered per origin, and presentation
   * only: a comment records the host page's scheme whatever this says.
   */
  setTheme(preference: ThemePreference): void;
  /** Snapped to a corner by the surface; remembered per origin. */
  setPosition(position: Corner): void;
  /** Hidden for the session. Anything arriving takes it back off again. */
  setHidden(hidden: boolean): void;
  /** What a link, a mark or a row asked to be looked at. Null clears it. */
  select(id: string | null): void;
  /** What a pointer is over right now. Null clears it; nothing records it. */
  peek(id: string | null): void;

  arm(kind: PickKind): void;
  disarm(): void;

  /** Opens on a target, resuming the draft already left on it if there is one. */
  openComposer(target: ComposerTarget): void;
  /**
   * Opens the panel on a comment already written, to read rather than to
   * write. Also selects it, so the page rings what it is about.
   */
  viewComment(id: string): void;
  resumeDraft(id: string): void;
  setBody(body: string): void;
  attach(ref: MediaRef): void;
  detach(key: string): void;
  /** Leaves the draft where it is. Only a send clears one. */
  closeComposer(): void;
  discardDraft(): void;
  send(): Promise<Comment>;

  setStatus(id: string, status: CommentStatus, resolution?: ResolutionClaim): Promise<Comment>;
}

const CLOSED: ComposerState = {
  open: false,
  body: "",
  attachments: [],
  dirty: false,
  sending: false,
};

const UNARMED: PickState = { armed: false };

interface Runtime {
  readonly options: MapleClientOptions;
  readonly config: MapleConfig;
  readonly transport: Transport;
  readonly drafts: DraftKeeper;
  readonly listeners: Set<(state: ClientState) => void>;
  readonly now: () => number;
  guard: NavigationGuard | undefined;
  theme: ThemeWatch | undefined;
  release: (() => void) | undefined;
  state: ClientState;
}

/** Builds the controller. Reaches storage once; reaches the DOM on `start()`. */
export function createMapleClient(options: MapleClientOptions): MapleClient {
  const runtime = runtimeFor(options);

  return {
    getState: () => runtime.state,
    subscribe(listener) {
      runtime.listeners.add(listener);
      return () => runtime.listeners.delete(listener);
    },
    start: () => start(runtime),
    destroy: () => destroy(runtime),

    load: () => load(runtime),
    setFilter: (filter) => patch(runtime, { filter }),
    setShowResolved: (showResolved) => patch(runtime, { showResolved }),
    setDetail: (detail) => remember(runtime, { detail }),
    setTheme: (themePreference) => remember(runtime, { themePreference }),
    setPosition: (position) => remember(runtime, { position }),
    setHidden: (hidden) => patch(runtime, { hidden }),
    select: (id) => patch(runtime, { selected: id, hidden: id === null && runtime.state.hidden }),
    peek: (id) => patch(runtime, { peeked: id }),

    arm: (kind) => patch(runtime, { pick: { armed: true, kind }, hidden: false }),
    disarm: () => patch(runtime, { pick: UNARMED }),

    openComposer: (target) => openComposer(runtime, target),
    viewComment: (id) => viewComment(runtime, id),
    resumeDraft: (id) => resumeDraft(runtime, id),
    setBody: (body) => write(runtime, { body }),
    attach: (ref) => write(runtime, { attachments: [...runtime.state.composer.attachments, ref] }),
    detach: (key) =>
      write(runtime, {
        attachments: runtime.state.composer.attachments.filter((ref) => ref.key !== key),
      }),
    closeComposer: () => composer(runtime, { open: false }),
    discardDraft: () => discardDraft(runtime),
    send: () => send(runtime),

    setStatus: (id, status, resolution) => setStatus(runtime, id, status, resolution),
  };
}

function runtimeFor(options: MapleClientOptions): Runtime {
  const config = options.config ?? readMapleConfig(options, storageOf(options));
  const drafts = createDraftKeeper({
    branch: options.branch,
    ...(options.storage === undefined ? {} : { storage: options.storage }),
    ...(options.logger === undefined ? {} : { logger: options.logger }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.debounceMs === undefined ? {} : { debounceMs: options.debounceMs }),
  });

  return {
    options,
    config,
    transport: createTransport(options),
    drafts,
    listeners: new Set(),
    now: options.now ?? Date.now,
    guard: undefined,
    theme: undefined,
    release: undefined,
    state: derive({
      phase: "idle",
      comments: [],
      visible: [],
      filter: "all",
      showResolved: !config.hideResolved,
      detail: config.detail,
      position: config.position,
      hidden: false,
      selected: config.comment ?? null,
      peeked: null,
      openCount: 0,
      drafts: drafts.list(),
      composer: CLOSED,
      pick: config.pick === undefined ? UNARMED : { armed: true, kind: config.pick },
      theme: themeFrom({}),
      themePreference: config.theme,
      user: null,
      error: null,
    }),
  };
}

/** Where a preference is kept, which is where a draft is kept. */
function storageOf(options: MapleClientOptions) {
  return {
    ...(options.storage === undefined ? {} : { storage: options.storage }),
    ...(options.origin === undefined ? {} : { origin: options.origin }),
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  };
}

/**
 * A preference the viewer set, in the state and in storage. Both switches are
 * presentation: the export fence carries every field whichever one is on.
 */
function remember(runtime: Runtime, change: Partial<ClientState>): void {
  patch(runtime, change);
  writePreferences(
    {
      detail: runtime.state.detail,
      position: runtime.state.position,
      theme: runtime.state.themePreference,
    },
    storageOf(runtime.options),
  );
}

/** Recomputes everything derived, so no caller can forget to. */
function derive(state: ClientState): ClientState {
  return {
    ...state,
    visible: visibleComments(state.comments, state.filter, state.showResolved),
    openCount: openCount(state.comments),
  };
}

function patch(runtime: Runtime, change: Partial<ClientState>): void {
  runtime.state = derive({ ...runtime.state, ...change });
  for (const listener of runtime.listeners) listener(runtime.state);
}

function composer(runtime: Runtime, change: Partial<ComposerState>): void {
  patch(runtime, { composer: { ...runtime.state.composer, ...change } });
}

/**
 * Every listener the controller owns, attached in one place so `destroy` can
 * take all of them back off again.
 */
function start(runtime: Runtime): void {
  const view = runtime.options.view ?? (globalThis as { window?: ClientView }).window;
  if (!view || runtime.guard) return;

  runtime.guard = navigationFor(runtime, view);
  runtime.guard.start();
  runtime.guard.setDirty(runtime.state.composer.dirty);

  runtime.theme = watchTheme({
    view,
    ...(runtime.options.root === undefined ? {} : { root: runtime.options.root }),
    onChange: (theme) => patch(runtime, { theme }),
  });
  patch(runtime, { theme: runtime.theme.current() });

  const abort = new AbortController();
  const { signal } = abort;
  view.document.addEventListener("keydown", (event) => onKeydown(runtime, event), { signal });
  view.addEventListener("storage", (event) => onStorage(runtime, event), { signal });

  const unsubscribe = runtime.drafts.subscribe(() =>
    patch(runtime, { drafts: runtime.drafts.list() }),
  );
  runtime.release = () => {
    abort.abort();
    unsubscribe();
  };
}

function navigationFor(runtime: Runtime, view: ClientView): NavigationGuard {
  const { options } = runtime;
  return createNavigationGuard({
    view,
    save: () => runtime.drafts.flush(),
    isDirty: () => runtime.state.composer.dirty,
    ...(options.confirmOnUnload === undefined ? {} : { confirmOnUnload: options.confirmOnUnload }),
    ...(options.askToLeave === undefined ? {} : { prompt: promptFor(runtime) }),
    onLeave: (reason) => {
      options.onLeave?.(reason);
      patch(runtime, { drafts: runtime.drafts.list() });
    },
  });
}

/**
 * The guard has no words and no DOM; the controller only says what is at stake
 * and what a `discard` answer means. Every word of the copy is the surface's.
 */
function promptFor(runtime: Runtime): LeavePrompt {
  return {
    subject: () => subjectOf(runtime.state.composer),
    ask: (question) => runtime.options.askToLeave?.(question) ?? "keep",
    discard: () => discardDraft(runtime),
  };
}

/** What the reviewer would lose, named the way the ring names it. */
function subjectOf(composer: ComposerState): LeaveSubject | undefined {
  const { draftId, target } = composer;
  if (!composer.dirty || draftId === undefined) return undefined;
  return target?.label === undefined ? { id: draftId } : { id: draftId, label: target.label };
}

function destroy(runtime: Runtime): void {
  runtime.guard?.stop();
  runtime.theme?.stop();
  runtime.release?.();
  runtime.drafts.destroy();
  runtime.listeners.clear();
  runtime.guard = undefined;
  runtime.theme = undefined;
  runtime.release = undefined;
}

/** `c` arms element picking; `Ctrl`+`C` is copy and must not reach this. */
function onKeydown(runtime: Runtime, event: Event): void {
  if (runtime.state.composer.open) return;
  if (!opensComposer(event as KeyboardEvent, runtime.config.shortcut)) return;
  patch(runtime, { pick: { armed: true, kind: "element" }, hidden: false });
}

/** Another tab wrote. Re-read rather than trusting what is in memory here. */
function onStorage(runtime: Runtime, event: Event): void {
  if (!runtime.drafts.owns((event as StorageEvent).key)) return;
  runtime.drafts.reconcile();
  patch(runtime, { drafts: runtime.drafts.list() });
}

async function load(runtime: Runtime): Promise<void> {
  patch(runtime, { phase: "loading" });
  try {
    const comments = await runtime.transport.list();
    patch(runtime, {
      phase: "ready",
      comments,
      hidden: runtime.state.hidden && comments.length <= runtime.state.comments.length,
      drafts: runtime.drafts.list(),
      user: await whoAmI(runtime),
      error: null,
    });
  } catch (error) {
    patch(runtime, { phase: "error", error: readable(error) });
  }
}

/** A route that cannot say who this is means a guest, not a failed load. */
async function whoAmI(runtime: Runtime): Promise<ClientState["user"]> {
  try {
    return await runtime.transport.me();
  } catch (error) {
    runtime.options.logger?.warn("Could not identify the reviewer; offering the guest flow.", {
      error: String(error),
    });
    return null;
  }
}

function openComposer(runtime: Runtime, target: ComposerTarget): void {
  const existing = runtime.drafts.find(target.anchor);
  const draftId = existing?.id ?? draftIdFor(target.anchor, runtime.now());

  patch(runtime, {
    pick: UNARMED,
    hidden: false,
    composer: {
      open: true,
      target: named(target),
      draftId,
      body: existing?.body ?? "",
      attachments: existing?.attachments ?? [],
      dirty: existing !== undefined,
      sending: false,
    },
  });
  runtime.guard?.setDirty(runtime.state.composer.dirty);
}

/**
 * Reading one, not writing one: no draft is opened and nothing is made dirty,
 * so closing the panel leaves exactly what it found.
 */
function viewComment(runtime: Runtime, id: string): void {
  const comment = runtime.state.comments.find((one) => one.id === id);
  if (!comment) return;

  patch(runtime, {
    pick: UNARMED,
    hidden: false,
    selected: id,
    composer: {
      open: true,
      viewing: id,
      target: {
        kind: comment.anchor.quote === undefined ? "element" : "text",
        anchor: comment.anchor,
        context: comment.context,
      },
      body: comment.body,
      attachments: comment.attachments ?? [],
      dirty: false,
      sending: false,
    },
  });
}

/**
 * The ring's label, through the one rule that resolves it. A caller that
 * already has the element passes a better one; nobody has to invent a second.
 */
function named(target: ComposerTarget): ComposerTarget {
  if (target.label !== undefined) return target;
  const label = labelFor({ anchor: target.anchor });
  return label === undefined ? target : { ...target, label };
}

function resumeDraft(runtime: Runtime, id: string): void {
  const draft = runtime.drafts.get(id);
  if (!draft) return;

  openComposer(runtime, {
    kind: "element",
    anchor: draft.anchor,
    ...(draft.context === undefined ? {} : { context: draft.context }),
  });
}

/** An open composer, narrowed so nothing downstream asserts what it has. */
interface WritableComposer extends ComposerState {
  readonly target: ComposerTarget;
  readonly draftId: string;
}

function isWritable(state: ComposerState): state is WritableComposer {
  return state.open && state.target !== undefined && state.draftId !== undefined;
}

/** A keystroke: the composer changes, and the draft follows it to storage. */
function write(runtime: Runtime, change: Partial<ComposerState>): void {
  const current = runtime.state.composer;
  if (!isWritable(current)) return;

  const next = { ...current, ...change, dirty: true };
  runtime.drafts.save(draftFrom(runtime, next));
  patch(runtime, { composer: next, drafts: runtime.drafts.list() });
  runtime.guard?.setDirty(true);
}

function draftFrom(runtime: Runtime, state: WritableComposer): Draft {
  return {
    id: state.draftId,
    body: state.body,
    anchor: state.target.anchor,
    ...(state.target.context === undefined ? {} : { context: state.target.context }),
    ...(state.attachments.length === 0 ? {} : { attachments: state.attachments }),
    updatedAt: new Date(runtime.now()).toISOString(),
  };
}

function discardDraft(runtime: Runtime): void {
  const { draftId } = runtime.state.composer;
  if (draftId !== undefined) runtime.drafts.discard(draftId);

  patch(runtime, { composer: CLOSED, drafts: runtime.drafts.list() });
  runtime.guard?.setDirty(false);
}

async function send(runtime: Runtime): Promise<Comment> {
  const state = runtime.state.composer;
  if (!isWritable(state)) throw new Error("There is no composer to send.");
  if (state.body.trim() === "") throw new Error("A comment needs a body before it is sent.");

  composer(runtime, { sending: true });
  try {
    const comment = await runtime.transport.append(postedFrom(runtime, state));
    runtime.drafts.markSent(state.draftId);

    patch(runtime, {
      comments: [comment, ...runtime.state.comments],
      composer: CLOSED,
      drafts: runtime.drafts.list(),
      hidden: false,
      error: null,
    });
    runtime.guard?.setDirty(false);
    return comment;
  } catch (error) {
    composer(runtime, { sending: false });
    patch(runtime, { error: readable(error) });
    throw error;
  }
}

/** The author is the route's to decide, so nothing here claims one. */
function postedFrom(runtime: Runtime, state: WritableComposer): PostedComment {
  return {
    branch: runtime.options.branch,
    body: state.body,
    anchor: state.target.anchor,
    createdAt: new Date(runtime.now()).toISOString(),
    ...(state.target.context === undefined ? {} : { context: state.target.context }),
    ...(state.attachments.length === 0 ? {} : { attachments: state.attachments }),
  };
}

async function setStatus(
  runtime: Runtime,
  id: string,
  status: CommentStatus,
  resolution?: ResolutionClaim,
): Promise<Comment> {
  const updated = await runtime.transport.setStatus(id, status, resolution);
  patch(runtime, {
    comments: runtime.state.comments.map((comment) => (comment.id === id ? updated : comment)),
    hidden: false,
  });
  return updated;
}

function readable(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
