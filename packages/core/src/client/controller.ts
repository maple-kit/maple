/**
 * The reviewer state machine: the only place the model lives.
 *
 * A plain object with `subscribe` and imperative methods, so a React,
 * Svelte or Astro binding is a `useSyncExternalStore` call over it and nothing
 * more. It touches no DOM until `start()`, which is what lets every rule in
 * here — the filters, the counts, the draft's life, the shortcut's modifier
 * guard — be tested without a browser.
 */

import { kindOf } from "../anchor/kind.js";
import { labelFor } from "../anchor/label.js";
import { exportDrafts } from "../export/drafts.js";
import { pageIsTagged } from "../overlay/tagged.js";
import { ASSIST_IDLE, createAssistRunner } from "./assist.js";
import { createDraftKeeper, draftIdFor } from "./drafts.js";
import { detailOf, failureFrom } from "./failure.js";
import { openCount, visibleComments } from "./filters.js";
import { startLink } from "./link.js";
import { createNavigationGuard } from "./navigation.js";
import { readMapleConfig, readPreferences, writePreferences } from "./preferences.js";
import { opensComposer } from "./shortcut.js";
import { themeFrom, watchTheme } from "./theme.js";
import { createTransport } from "./transport.js";
import { PICK_ORDER } from "./types.js";

import type { CommentKind } from "../connectors/types.js";
import type { Logger } from "../logger/types.js";
import type { Draft } from "../overlay/drafts.js";
import type { Approval, Comment, CommentStatus, MediaRef } from "../types.js";
import type { AssistRunner } from "./assist.js";
import type { DraftKeeper } from "./drafts.js";
import type { MapleFailure } from "./failure.js";
import type { LinkRun } from "./link.js";
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
  ApprovalConfig,
  AssistConfig,
  AssistState,
  ClientState,
  CommentFilter,
  ComposerState,
  ComposerTarget,
  Corner,
  Detail,
  GitHubLink,
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
  /**
   * What a reviewer calls this surface — a ticket, or a branch shortened to a
   * hostname label. Shown instead of `branch`, which stays the identifier.
   */
  readonly label?: string;
  /** The commit the preview is serving, where the build stamps one. */
  readonly commit?: string;
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
  /**
   * Let the browser ask before a hard exit. On by default now that a comment
   * is a draft until it is published: on disk is not the same as delivered.
   */
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
  /**
   * Puts an image where this deployment keeps them and returns the reference
   * a comment carries. Rejects when it has nowhere to keep one.
   */
  uploadMedia(blob: Blob, contentType: string): Promise<MediaRef>;
  /** A URL an `img` can load a kept screenshot from. Makes no request. */
  mediaUrl(ref: MediaRef): string;
  /** Takes the last failure off the state. Nothing is retried by it. */
  clearError(): void;
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
  /** Leaves the draft where it is, open. Only a publish clears one. */
  closeComposer(): void;
  /** Throws a draft away. With no id, the one the composer is writing into. */
  discardDraft(id?: string): void;
  /**
   * Closes the composer, keeping what was written as a draft. A comment is a
   * draft until it is published, and this is the end of writing one.
   */
  keepDraft(): void;
  /**
   * Publishes drafts to the store, oldest first, in one request. With no
   * argument it publishes every kept one, the open composer's included.
   */
  publish(ids?: readonly string[]): Promise<readonly Comment[]>;
  /** Every unsent comment as markdown, for a reviewer with nowhere to publish. */
  draftsAsMarkdown(): string;
  /**
   * Whether a comment is judged as it is typed, remembered per origin. It
   * cannot switch on a deployment that configured no classifier.
   */
  setAssist(on: boolean): void;
  /** Shows or hides everything the context card captured. */
  setContextOpen(open: boolean): void;
  /** The reviewer's own label for this comment. Nothing restores the guess. */
  setKind(kind: CommentKind | undefined): void;

  setStatus(id: string, status: CommentStatus, resolution?: ResolutionClaim): Promise<Comment>;

  /**
   * Records that this reviewer looked and found nothing to say. The route
   * names the commit: a page choosing one could approve what it never showed.
   */
  approve(note?: string): Promise<Approval>;
  /** Takes back this reviewer's own approval. Nobody else's is reachable. */
  unapprove(): Promise<void>;

  /**
   * Starts a GitHub link and resolves once there is a code to show. The
   * polling carries on after it resolves; watch `state.github` for the rest.
   */
  linkGitHub(): Promise<void>;
  /** Forgets the token on this deployment. GitHub keeps the authorisation. */
  unlinkGitHub(): Promise<void>;
}

const CLOSED: ComposerState = {
  open: false,
  body: "",
  attachments: [],
  dirty: false,
  sending: false,
  assist: ASSIST_IDLE,
  contextOpen: true,
};

const UNARMED: PickState = { armed: false };

/** Said to the log when nothing on the page carries a tagger attribute. */
export const UNTAGGED =
  "Maple found no data-maple-src on this page, so a comment cannot name a component or a " +
  "file. The tagger is not running on this build — see @maple-kit/core/next.";

interface Runtime {
  readonly options: MapleClientOptions;
  readonly config: MapleConfig;
  readonly transport: Transport;
  readonly drafts: DraftKeeper;
  readonly assist: AssistRunner;
  /** What the route said it can judge. Null until `/me` has answered. */
  judges: AssistConfig | null;
  /** Whether the viewer wants judging at all, whatever the route offers. */
  assistOn: boolean;
  /** What `c` arms from nothing: the kind the viewer armed last, remembered. */
  lastPick: PickKind;
  readonly listeners: Set<(state: ClientState) => void>;
  readonly now: () => number;
  guard: NavigationGuard | undefined;
  theme: ThemeWatch | undefined;
  link: LinkRun | undefined;
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
    uploadMedia: (blob, contentType) => runtime.transport.putMedia(blob, contentType),
    mediaUrl: (ref) => runtime.transport.mediaUrl(ref),
    clearError: () => patch(runtime, { error: null }),
    setFilter: (filter) => patch(runtime, { filter }),
    setShowResolved: (showResolved) => patch(runtime, { showResolved }),
    setDetail: (detail) => remember(runtime, { detail }),
    setTheme: (themePreference) => remember(runtime, { themePreference }),
    setPosition: (position) => remember(runtime, { position }),
    setHidden: (hidden) => patch(runtime, { hidden }),
    select: (id) => patch(runtime, { selected: id, hidden: id === null && runtime.state.hidden }),
    peek: (id) => patch(runtime, { peeked: id }),

    arm: (kind) => arm(runtime, kind),
    disarm: () => patch(runtime, { pick: UNARMED }),

    openComposer: (target) => openComposer(runtime, target),
    viewComment: (id) => viewComment(runtime, id),
    resumeDraft: (id) => resumeDraft(runtime, id),
    setBody: (body) => write(runtime, { body, contextOpen: false }),
    setContextOpen: (contextOpen) => composer(runtime, { contextOpen }),
    setKind: (kind) => chooseKind(runtime, kind),
    attach: (ref) => write(runtime, { attachments: [...runtime.state.composer.attachments, ref] }),
    detach: (key) =>
      write(runtime, {
        attachments: runtime.state.composer.attachments.filter((ref) => ref.key !== key),
      }),
    closeComposer: () => closeComposer(runtime),
    keepDraft: () => keepDraft(runtime),
    publish: (ids) => publish(runtime, ids),
    draftsAsMarkdown: () => copyable(runtime),
    setAssist: (on) => setAssist(runtime, on),
    discardDraft: (id) => discardDraft(runtime, id),

    setStatus: (id, status, resolution) => setStatus(runtime, id, status, resolution),

    approve: (note) => approve(runtime, note),
    unapprove: () => unapprove(runtime),

    linkGitHub: () => linkGitHub(runtime),
    unlinkGitHub: () => unlinkGitHub(runtime),
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

  const runtime: Runtime = {
    options,
    config,
    transport: createTransport(options),
    drafts,
    assist: createAssistRunner({
      judge: (body, signal) => runtime.transport.assist(body, signal),
      onChange: (assist) => judged(runtime, assist),
    }),
    judges: null,
    assistOn: config.assist,
    lastPick: readPreferences(storageOf(options)).lastPick ?? "element",
    listeners: new Set(),
    now: options.now ?? Date.now,
    guard: undefined,
    theme: undefined,
    link: undefined,
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
      publishing: false,
      composer: CLOSED,
      pick: config.pick === undefined ? UNARMED : { armed: true, kind: config.pick },
      theme: themeFrom({}),
      themePreference: config.theme,
      user: null,
      github: { state: "unsupported" },
      error: null,
      tagged: true,
      media: false,
      assist: null,
      approval: null,
      approvals: [],
      myApproval: null,
    }),
  };

  return runtime;
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
    myApproval: mine(state),
  };
}

/**
 * This reviewer's own approval, which is what the control toggles. Matched on
 * the author alone: a page comparing commits would compare against a guess.
 */
function mine(state: ClientState): Approval | null {
  const id = state.user?.id;
  if (id === undefined) return null;
  return state.approvals.find((approval) => approval.author.id === id) ?? null;
}

function patch(runtime: Runtime, change: Partial<ClientState>): void {
  runtime.state = derive({ ...runtime.state, ...change });
  for (const listener of runtime.listeners) listener(runtime.state);
}

function composer(runtime: Runtime, change: Partial<ComposerState>): void {
  patch(runtime, { composer: { ...runtime.state.composer, ...change } });
}

/** The draft stays; the judgement does not. Nothing off-screen is worth a call. */
function closeComposer(runtime: Runtime): void {
  runtime.assist.cancel();
  composer(runtime, { open: false, assist: ASSIST_IDLE });
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
  reconsiderDirty(runtime);

  runtime.theme = watchTheme({
    view,
    ...(runtime.options.root === undefined ? {} : { root: runtime.options.root }),
    onChange: (theme) => patch(runtime, { theme }),
  });
  patch(runtime, { theme: runtime.theme.current() });
  checkTagged(runtime, view.document);

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
    isDirty: () => unpublished(runtime),
    confirmOnUnload: options.confirmOnUnload !== false,
    ...(options.askToLeave === undefined ? {} : { prompt: promptFor(runtime) }),
    onLeave: (reason) => {
      options.onLeave?.(reason);
      patch(runtime, { drafts: runtime.drafts.list() });
    },
  });
}

/**
 * Anything nobody else can see yet: a draft being typed, or one kept. Safe
 * from a reload is not delivered, and the guard says so before a tab closes.
 */
function unpublished(runtime: Runtime): boolean {
  return runtime.state.composer.dirty || runtime.state.drafts.length > 0;
}

/** Told to the guard wherever a draft is made, kept, thrown away or published. */
function reconsiderDirty(runtime: Runtime): void {
  runtime.guard?.setDirty(unpublished(runtime));
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
  runtime.link?.cancel();
  runtime.assist.cancel();
  runtime.drafts.destroy();
  runtime.listeners.clear();
  runtime.guard = undefined;
  runtime.theme = undefined;
  runtime.release = undefined;
  runtime.link = undefined;
}

/**
 * `c` arms the kind armed last, and pressed again moves to the next, so one
 * key starts a comment and changes its kind. `Ctrl`+`C` is copy, not this.
 */
function onKeydown(runtime: Runtime, event: Event): void {
  if (runtime.state.composer.open) return;
  if (!opensComposer(event as KeyboardEvent, runtime.config.shortcut)) return;
  const { pick } = runtime.state;
  arm(runtime, pick.armed && pick.kind ? nextPick(pick.kind) : runtime.lastPick);
}

/** The kind after this one in {@link PICK_ORDER}, wrapping at the end. */
function nextPick(kind: PickKind): PickKind {
  const at = PICK_ORDER.indexOf(kind);
  return PICK_ORDER[(at + 1) % PICK_ORDER.length] ?? "element";
}

/** Another tab wrote. Re-read rather than trusting what is in memory here. */
function onStorage(runtime: Runtime, event: Event): void {
  if (!runtime.drafts.owns((event as StorageEvent).key)) return;
  runtime.drafts.reconcile();
  patch(runtime, { drafts: runtime.drafts.list() });
}

/** Identity is asked alongside the list, not after it: a 401 on the comments
 * is usually a reviewer who has not signed in, and `/me` is where the offer is. */
async function load(runtime: Runtime): Promise<void> {
  patch(runtime, { phase: "loading" });
  const identity = whoAmI(runtime);

  try {
    const comments = await runtime.transport.list();
    const who = await identity;
    patch(runtime, {
      phase: "ready",
      comments,
      hidden: runtime.state.hidden && comments.length <= runtime.state.comments.length,
      drafts: runtime.drafts.list(),
      ...who,
      ...(await approvalsFor(runtime, who.approval)),
      error: null,
    });
  } catch (error) {
    patch(runtime, await identity);
    fail(runtime, error, "load");
    patch(runtime, { phase: "error" });
  }
}

/** A route that cannot say who this is means a guest, not a failed load. */
async function whoAmI(
  runtime: Runtime,
): Promise<Pick<ClientState, "approval" | "assist" | "github" | "media" | "user">> {
  try {
    const identity = await runtime.transport.me();
    runtime.judges = identity.assist ? { pillars: identity.assist.pillars } : null;
    return {
      user: identity.user,
      github: linkOf(identity.github),
      media: identity.media === true,
      assist: assistFrom(runtime),
      approval: { supported: false, required: identity.approval?.required === true },
    };
  } catch (error) {
    runtime.options.logger?.warn("Could not identify the reviewer; offering the guest flow.", {
      error: String(error),
    });
    return {
      user: null,
      github: { state: "unsupported" },
      media: false,
      assist: null,
      approval: null,
    };
  }
}

/**
 * Whether approvals are kept here, and the ones that are. `/me` cannot say,
 * so the store is asked: "nowhere to keep one" is no offer, not a failure.
 */
async function approvalsFor(
  runtime: Runtime,
  approval: ApprovalConfig | null,
): Promise<Pick<ClientState, "approval" | "approvals">> {
  const required = approval?.required === true;
  try {
    const approvals = await runtime.transport.approvals();
    if (approvals === undefined) return { approval: { supported: false, required }, approvals: [] };
    return { approval: { supported: true, required }, approvals };
  } catch (error) {
    runtime.options.logger?.warn("Could not read the approvals on this surface.", {
      error: String(error),
    });
    return { approval: { supported: false, required }, approvals: [] };
  }
}

/**
 * No `github` on the answer is a route with no sign-in at all, not a reviewer
 * who has not linked. One draws nothing and the other draws an offer.
 */
function linkOf(github: { linked: boolean; login?: string } | undefined): GitHubLink {
  if (github === undefined) return { state: "unsupported" };
  if (!github.linked) return { state: "unlinked" };
  return { state: "linked", ...(github.login === undefined ? {} : { login: github.login }) };
}

/** Resolves once there is a code to show. The polling outlives the call. */
async function linkGitHub(runtime: Runtime): Promise<void> {
  runtime.link?.cancel();
  try {
    runtime.link = await startLink({
      transport: runtime.transport,
      onChange: (github) => patch(runtime, { github }),
      ...(runtime.options.now === undefined ? {} : { now: runtime.options.now }),
    });
  } catch (error) {
    patch(runtime, { github: { state: "failed", reason: failureFrom(error, "link").message } });
    runtime.options.logger?.error(
      "A Maple GitHub link failed.",
      error instanceof Error ? error : new Error(detailOf(error)),
    );
  }
}

async function unlinkGitHub(runtime: Runtime): Promise<void> {
  runtime.link?.cancel();
  runtime.link = undefined;
  await runtime.transport.linkEnd();
  patch(runtime, { github: { state: "unlinked" } });
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
      assist: ASSIST_IDLE,
      contextOpen: true,
    },
  });
  reconsiderDirty(runtime);

  runtime.assist.cancel();
  if (runtime.state.assist && existing) runtime.assist.ask(existing.body);
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
        kind: kindOf(comment.anchor),
        anchor: comment.anchor,
        context: comment.context,
      },
      body: comment.body,
      attachments: comment.attachments ?? [],
      assist: ASSIST_IDLE,
      contextOpen: true,
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
  reconsiderDirty(runtime);

  if (change.body !== undefined && runtime.state.assist) runtime.assist.ask(change.body);
}

/** The reviewer's own label, or nothing to hand the kind back to the guess. */
function chooseKind(runtime: Runtime, kind: CommentKind | undefined): void {
  const { assist } = runtime.state.composer;
  const next = kind === undefined ? withoutChoice(assist) : { ...assist, chosenKind: kind };
  composer(runtime, { assist: next });
}

/** Absent and undefined are not the same under `exactOptionalPropertyTypes`. */
function withoutChoice(assist: AssistState): AssistState {
  const rest = { ...assist };
  delete rest.chosenKind;
  return rest;
}

/**
 * A judgement arrived, or was abandoned. It lands on the composer that asked
 * for it and nowhere else: a closed composer is judging nothing.
 */
function judged(runtime: Runtime, assist: AssistState): void {
  if (!runtime.state.composer.open) return;
  patch(runtime, { composer: { ...runtime.state.composer, assist } });
}

/** What the route can judge, once the viewer has been asked about it too. */
function assistFrom(runtime: Runtime): AssistConfig | null {
  return runtime.assistOn ? runtime.judges : null;
}

/** Turning it off abandons whatever was in flight rather than letting it land. */
function setAssist(runtime: Runtime, on: boolean): void {
  runtime.assistOn = on;
  writePreferences(
    { ...readMapleConfig(runtime.options, storageOf(runtime.options)), assist: on },
    storageOf(runtime.options),
  );

  runtime.assist.cancel();
  patch(runtime, { assist: assistFrom(runtime) });
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

/**
 * Throws a draft away. One the composer is not on is dropped where it sits,
 * so a row on the unsent list never has to open a panel to be rid of one.
 */
function discardDraft(runtime: Runtime, id?: string): void {
  const open = runtime.state.composer.draftId;
  const wanted = id ?? open;
  if (wanted === undefined) return;

  runtime.drafts.discard(wanted);
  const closes = wanted === open;
  if (closes) runtime.assist.cancel();

  patch(runtime, {
    drafts: runtime.drafts.list(),
    ...(closes ? { composer: CLOSED } : {}),
  });
  reconsiderDirty(runtime);
}

/**
 * Closes the composer on a draft worth keeping. Every keystroke is already in
 * storage, so this writes nothing new: it ends the writing, not the comment.
 */
function keepDraft(runtime: Runtime): void {
  const state = runtime.state.composer;
  if (!isWritable(state) || state.body.trim() === "") {
    discardDraft(runtime);
    return;
  }

  runtime.drafts.save(draftFrom(runtime, state));
  runtime.drafts.flush();
  runtime.assist.cancel();
  patch(runtime, { composer: CLOSED, drafts: runtime.drafts.list(), hidden: false });
  reconsiderDirty(runtime);
}

/**
 * Publishes drafts, newest last, in one request. A store that can take a
 * batch spends one write on them, so five comments are one notification.
 */
async function publish(runtime: Runtime, ids?: readonly string[]): Promise<readonly Comment[]> {
  const chosen = publishable(runtime, ids);
  if (chosen.length === 0) return [];

  patch(runtime, { publishing: true });
  try {
    const comments = await runtime.transport.appendMany(
      chosen.map((draft) => postedFromDraft(runtime, draft)),
    );
    for (const draft of chosen) runtime.drafts.markSent(draft.id);

    patch(runtime, {
      comments: [...comments].reverse().concat(runtime.state.comments),
      composer: composerAfter(runtime, chosen),
      drafts: runtime.drafts.list(),
      publishing: false,
      hidden: false,
      error: null,
    });
    reconsiderDirty(runtime);
    return comments;
  } catch (error) {
    patch(runtime, { publishing: false });
    fail(runtime, error, "send");
    throw error;
  }
}

/**
 * What a publish will send: the named drafts, or every kept one. Oldest
 * first, so the numbers on the pull request read in the order they were left.
 */
function publishable(runtime: Runtime, ids: readonly string[] | undefined): readonly Draft[] {
  const open = runtime.state.composer;
  if (isWritable(open) && open.dirty) runtime.drafts.save(draftFrom(runtime, open));
  runtime.drafts.flush();

  const all = oldestFirst(runtime.drafts.list());
  const wanted = ids === undefined ? all : all.filter((draft) => ids.includes(draft.id));
  return wanted.filter((draft) => draft.body.trim() !== "");
}

/** Oldest first, so the numbers on the pull request read in writing order. */
function oldestFirst(drafts: readonly Draft[]): readonly Draft[] {
  return [...drafts].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}

/** The composer survives a publish unless what it was writing has just gone. */
function composerAfter(runtime: Runtime, sent: readonly Draft[]): ComposerState {
  const { draftId } = runtime.state.composer;
  const gone = draftId !== undefined && sent.some((draft) => draft.id === draftId);
  return gone ? CLOSED : runtime.state.composer;
}

function postedFromDraft(runtime: Runtime, draft: Draft): PostedComment {
  return {
    branch: runtime.options.branch,
    ...(runtime.options.label === undefined ? {} : { label: runtime.options.label }),
    ...(runtime.options.commit === undefined ? {} : { commit: runtime.options.commit }),
    body: draft.body,
    anchor: draft.anchor,
    createdAt: draft.updatedAt,
    ...(draft.context === undefined ? {} : { context: draft.context }),
    ...(draft.attachments === undefined ? {} : { attachments: draft.attachments }),
  };
}

/** Everything unsent, as markdown to paste. The way out with no store. */
function copyable(runtime: Runtime): string {
  return exportDrafts(runtime.drafts.list(), {
    branch: runtime.options.branch,
    ...(runtime.options.label === undefined ? {} : { label: runtime.options.label }),
  }).markdown;
}

/** Records the approval and takes the verdict the route publishes with it. */
async function approve(runtime: Runtime, note?: string): Promise<Approval> {
  try {
    const approval = await runtime.transport.approve(note);
    patch(runtime, {
      approvals: [approval, ...runtime.state.approvals.filter((one) => one.id !== approval.id)],
      hidden: false,
      error: null,
    });
    return approval;
  } catch (error) {
    fail(runtime, error, "approve");
    throw error;
  }
}

/** Takes back this reviewer's own. There is no other one to reach from here. */
async function unapprove(runtime: Runtime): Promise<void> {
  const held = runtime.state.myApproval;
  if (!held) return;

  try {
    await runtime.transport.unapprove(held.id);
    patch(runtime, {
      approvals: runtime.state.approvals.filter((one) => one.id !== held.id),
      error: null,
    });
  } catch (error) {
    fail(runtime, error, "approve");
    throw error;
  }
}

async function setStatus(
  runtime: Runtime,
  id: string,
  status: CommentStatus,
  resolution?: ResolutionClaim,
): Promise<Comment> {
  try {
    const updated = await runtime.transport.setStatus(id, status, resolution);
    patch(runtime, {
      comments: runtime.state.comments.map((comment) => (comment.id === id ? updated : comment)),
      hidden: false,
      error: null,
    });
    return updated;
  } catch (error) {
    fail(runtime, error, "status");
    throw error;
  }
}

/** Asked again on every arm: a client-routed page can navigate from a tagged
 * view into one rendered by something the loader never saw. */
function arm(runtime: Runtime, kind: PickKind): void {
  const view = runtime.options.view ?? (globalThis as { window?: ClientView }).window;
  if (view) checkTagged(runtime, view.document);
  patch(runtime, { pick: { armed: true, kind }, hidden: false });
  if (kind === runtime.lastPick) return;
  runtime.lastPick = kind;
  writePreferences({ lastPick: kind }, storageOf(runtime.options));
}

/** Said once to the log, because it is a build to fix rather than a page. */
function checkTagged(runtime: Runtime, page: Document): void {
  const tagged = pageIsTagged(page);
  if (tagged === runtime.state.tagged) return;

  patch(runtime, { tagged });
  if (!tagged) runtime.options.logger?.warn(UNTAGGED);
}

/** The failure a surface reads; the route's own words go to the log instead,
 * because a connector can name a repository or a rate limit. */
function fail(runtime: Runtime, error: unknown, during: MapleFailure["during"]): void {
  patch(runtime, { error: failureFrom(error, during) });
  runtime.options.logger?.error(
    `A Maple ${during} failed.`,
    error instanceof Error ? error : new Error(detailOf(error)),
  );
}
