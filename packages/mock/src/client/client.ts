/**
 * The mock box's state machine, with no interface attached.
 *
 * A plain object with `subscribe`, like core's reviewer controller, so a React
 * or any other binding is a subscription over it. It reads the installed
 * transport's handle rather than importing the interceptor, and touches no DOM
 * until `start()`. Applying a recipe reloads the page: see `docs/mock.md`.
 */

import { opensMock, watchEscape, watchTheme } from "@maple-kit/core/client";
import { MOCK_STATES, RECIPE_VERSION } from "@maple-kit/core/mock";

import { installedMock } from "../handle.js";
import { forgetRecipe, linkRecipe, saveRecipe } from "../link.js";
import { pathPattern } from "../rest.js";

import type { MockHandle } from "../interceptor.js";
import type { Scheme, ThemeView } from "@maple-kit/core/client";
import type { MockCall, MockState, Recipe, ShapeSource } from "@maple-kit/core/mock";

/** What the client attaches to. `window` satisfies it. */
export interface MockView extends ThemeView {
  readonly location: Pick<Location, "href" | "pathname" | "assign">;
  readonly sessionStorage?: Storage;
  readonly navigator?: { readonly clipboard?: Pick<Clipboard, "writeText"> };
  addEventListener(type: "popstate", listener: () => void, options?: AddEventListenerOptions): void;
}

/** How the client is built. Every field has a working default. */
export interface MockClientOptions {
  /** The installed transport. Defaults to the one `installMock` put in this page. */
  readonly handle?: MockHandle;
  /** Defaults to `globalThis.window`. */
  readonly view?: MockView;
  /** The key that opens the box, or false for none. Defaults to `m`. */
  readonly shortcut?: string | false;
  /** Start with the box open. */
  readonly defaultOpen?: boolean;
}

/** One call the box offers, and the state the draft puts it in. */
export interface MockCallRow {
  readonly key: string;
  readonly state?: MockState;
  /** False for a call the draft names that this route has not recorded. */
  readonly seen: boolean;
  /** Where the call's shape came from, once it is known; absent with none. */
  readonly source?: ShapeSource;
}

/** Everything a surface draws. Replaced whole on a change. */
export interface MockClientState {
  /** False when no transport is installed: a surface draws nothing. */
  readonly installed: boolean;
  readonly open: boolean;
  /** What the box's field filters the calls by. */
  readonly query: string;
  /** The page's route pattern, which a recipe applied from here is scoped to. */
  readonly route: string;
  /** The calls matching the query, most recent first. */
  readonly calls: readonly MockCallRow[];
  /** What Apply would put in force. Starts as the active recipe's calls. */
  readonly draft: readonly MockCall[];
  /** The recipe in force on this route, which the banner names. */
  readonly active: Recipe | undefined;
  /** True when the draft differs from what is in force. */
  readonly changed: boolean;
  /** What a surface of its own is drawn in: the opposite of the page. */
  readonly scheme: Scheme;
}

/** The controller. A binding reads `subscribe` and calls the rest. */
export interface MockClient {
  getState(): MockClientState;
  /** Returns the unsubscribe. */
  subscribe(listener: (state: MockClientState) => void): () => void;
  /** Attaches the shortcut, Escape, the theme watch and the inventory. */
  start(): void;
  destroy(): void;
  setOpen(open: boolean): void;
  toggle(): void;
  setQuery(query: string): void;
  /** Puts a call in a state, or takes it out of the draft when undefined. */
  choose(key: string, state: MockState | undefined): void;
  clear(): void;
  /** The draft as a recipe for this route, or undefined when it names nothing. */
  recipe(): Recipe | undefined;
  /** A link that opens this page with the draft in force, or without a mock when it is empty. */
  link(): URL;
  /** Keeps the draft for the tab and reloads into it. An empty draft turns mocking off. */
  apply(): void;
  /** Forgets the recipe and reloads without it. */
  turnOff(): void;
  /** @throws {MockClipboardError} when the draft is empty or the page offers no clipboard. */
  copyLink(): Promise<void>;
  /** @throws {MockClipboardError} when the draft is empty or the page offers no clipboard. */
  copyRecipe(): Promise<void>;
}

/** Raised when a copy has nothing to copy or nowhere to put it. */
export class MockClipboardError extends Error {
  override readonly name = "MockClipboardError";
}

interface Runtime {
  readonly handle: MockHandle | undefined;
  readonly view: MockView | undefined;
  readonly options: MockClientOptions;
  readonly listeners: Set<(state: MockClientState) => void>;
  /** Each looked-up call's shape source, null for a call nothing describes. */
  readonly sources: Map<string, ShapeSource | null>;
  state: MockClientState;
  stop?: () => void;
}

/** A mock box controller over the installed transport. */
export function createMockClient(options: MockClientOptions = {}): MockClient {
  const view = options.view ?? (globalThis as { window?: MockView }).window;
  const handle = options.handle ?? installedMock();
  const state = initial(options.defaultOpen === true);
  const runtime: Runtime = {
    handle,
    view,
    options,
    listeners: new Set(),
    sources: new Map(),
    state,
  };
  runtime.state = derive(runtime, { draft: activeOn(runtime, routeOf(view))?.calls ?? [] });

  return {
    getState: () => runtime.state,
    subscribe(listener) {
      runtime.listeners.add(listener);
      return () => {
        runtime.listeners.delete(listener);
      };
    },
    start: () => start(runtime),
    destroy() {
      runtime.stop?.();
      delete runtime.stop;
    },
    setOpen: (open) => patch(runtime, { open }),
    toggle: () => patch(runtime, { open: !runtime.state.open }),
    setQuery: (query) => patch(runtime, { query }),
    choose: (key, state) => patch(runtime, { draft: chosen(runtime.state.draft, key, state) }),
    clear: () => patch(runtime, { draft: [] }),
    recipe: () => recipeOf(runtime.state),
    link: () => linkRecipe(hrefOf(runtime), recipeOf(runtime.state)),
    apply: () => apply(runtime),
    turnOff: () => turnOff(runtime),
    copyLink: () => copyDraft(runtime, (recipe) => linkRecipe(hrefOf(runtime), recipe).href),
    copyRecipe: () => copyDraft(runtime, (recipe) => JSON.stringify(recipe, null, 2)),
  };
}

function initial(open: boolean): MockClientState {
  return {
    installed: false,
    open,
    query: "",
    route: "/",
    calls: [],
    draft: [],
    active: undefined,
    changed: false,
    scheme: "light",
  };
}

/** Recomputes everything read off the page and the handle, around `next`. */
function derive(runtime: Runtime, next: Partial<MockClientState>): MockClientState {
  const merged = { ...runtime.state, ...next };
  const route = routeOf(runtime.view);
  const active = activeOn(runtime, route);
  return {
    ...merged,
    installed: runtime.handle !== undefined,
    route,
    active,
    calls: rows(runtime, route, merged),
    changed: !sameCalls(merged.draft, active?.calls ?? []),
  };
}

function patch(runtime: Runtime, next: Partial<MockClientState>): void {
  runtime.state = derive(runtime, next);
  for (const listener of [...runtime.listeners]) listener(runtime.state);
  if (runtime.stop !== undefined) lookUp(runtime);
}

function start(runtime: Runtime): void {
  const { handle, options, view } = runtime;
  if (runtime.stop !== undefined || view === undefined) return;

  const abort = new AbortController();
  const signal = abort.signal;
  const theme = watchTheme({ view, onChange: (next) => patch(runtime, { scheme: next.overlay }) });
  const unsubscribe = handle?.inventory.subscribe(() => patch(runtime, {})) ?? (() => undefined);

  view.addEventListener("popstate", () => patch(runtime, {}), { signal });
  if (handle !== undefined && options.shortcut !== false) {
    view.document.addEventListener("keydown", (event) => onKeydown(runtime, event), { signal });
    watchEscape({ view: view.document, signal, onEscape: () => patch(runtime, { open: false }) });
  }

  runtime.stop = () => {
    abort.abort();
    theme.stop();
    unsubscribe();
  };
  patch(runtime, { scheme: theme.current().overlay });
}

/** Asks for the shape of every listed call not asked about yet, once started. */
function lookUp(runtime: Runtime): void {
  const shape = runtime.handle?.shape;
  if (shape === undefined) return;
  for (const { key } of runtime.state.calls) {
    if (runtime.sources.has(key)) continue;
    runtime.sources.set(key, null);
    void Promise.resolve(shape(key)).then((found) => {
      if (found === undefined) return;
      runtime.sources.set(key, found.source);
      patch(runtime, {});
    });
  }
}

function onKeydown(runtime: Runtime, event: KeyboardEvent): void {
  const key = runtime.options.shortcut;
  if (!opensMock(event, typeof key === "string" ? key : undefined)) return;
  event.preventDefault();
  patch(runtime, { open: !runtime.state.open });
}

/** The recipe in force, when it applies on `route`. */
function activeOn(runtime: Runtime, route: string): Recipe | undefined {
  const recipe = runtime.handle?.recipe;
  if (recipe === undefined) return undefined;
  return recipe.route === undefined || recipe.route === route ? recipe : undefined;
}

/** The recorded calls, then any the draft names that were never recorded here. */
function rows(runtime: Runtime, route: string, state: MockClientState): MockCallRow[] {
  const states = new Map(state.draft.map((call) => [call.key, call.state]));
  const seen = (runtime.handle?.inventory.calls(route) ?? []).map((sample) => sample.key);
  const unseen = state.draft.map((call) => call.key).filter((key) => !seen.includes(key));
  const words = state.query.toLowerCase().split(/\s+/).filter(Boolean);

  return [...seen.map((key) => [key, true] as const), ...unseen.map((key) => [key, false] as const)]
    .filter(([key]) => words.every((word) => key.toLowerCase().includes(word)))
    .map(([key, recorded]) => {
      const chosen = states.get(key);
      const source = runtime.sources.get(key) ?? undefined;
      return {
        key,
        seen: recorded,
        ...(chosen === undefined ? {} : { state: chosen }),
        ...(source === undefined ? {} : { source }),
      };
    });
}

/** The draft with `key` set to `state`, keeping its place, or dropped. */
function chosen(draft: readonly MockCall[], key: string, state: MockState | undefined) {
  const index = draft.findIndex((call) => call.key === key);
  if (state === undefined) return draft.filter((call) => call.key !== key);
  if (!MOCK_STATES.includes(state)) return draft;
  if (index === -1) return [...draft, { key, state }];
  return draft.map((call, at) => (at === index ? { key, state } : call));
}

function sameCalls(a: readonly MockCall[], b: readonly MockCall[]): boolean {
  if (a.length !== b.length) return false;
  const byKey = new Map(b.map((call) => [call.key, call.state]));
  return a.every((call) => byKey.get(call.key) === call.state);
}

function recipeOf(state: MockClientState): Recipe | undefined {
  if (state.draft.length === 0) return undefined;
  return { version: RECIPE_VERSION, calls: state.draft, route: state.route };
}

function apply(runtime: Runtime): void {
  const recipe = recipeOf(runtime.state);
  if (recipe === undefined) return turnOff(runtime);
  const storage = tabStorage(runtime.view);
  if (storage !== undefined) saveRecipe(storage, recipe);
  runtime.view?.location.assign(linkRecipe(hrefOf(runtime), recipe).href);
}

function turnOff(runtime: Runtime): void {
  const storage = tabStorage(runtime.view);
  if (storage !== undefined) forgetRecipe(storage);
  runtime.view?.location.assign(linkRecipe(hrefOf(runtime), undefined).href);
}

async function copyDraft(runtime: Runtime, write: (recipe: Recipe) => string): Promise<void> {
  const recipe = recipeOf(runtime.state);
  if (recipe === undefined) throw new MockClipboardError("The draft names no call to copy.");
  const clipboard = runtime.view?.navigator?.clipboard;
  if (clipboard === undefined) throw new MockClipboardError("This page offers no clipboard.");
  await clipboard.writeText(write(recipe));
}

function hrefOf(runtime: Runtime): string {
  return runtime.view?.location.href ?? "http://localhost/";
}

function routeOf(view: MockView | undefined): string {
  return pathPattern(view?.location.pathname ?? "/");
}

/** `sessionStorage`, which throws on read where the page's storage is blocked. */
function tabStorage(view: MockView | undefined): Storage | undefined {
  try {
    return view?.sessionStorage;
  } catch {
    return undefined;
  }
}
