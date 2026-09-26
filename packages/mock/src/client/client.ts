/**
 * The mock box's state machine, with no interface attached.
 *
 * A plain object with `subscribe`, like core's reviewer controller, so a React
 * or any other binding is a subscription over it. It reads the installed
 * transport's handle rather than importing the interceptor, and touches no DOM
 * until `start()`. Applying a recipe reloads the page: see `docs/mock.md`.
 */

import { navigateOnPurpose, opensMock, watchEscape, watchTheme } from "@maple-kit/core/client";
import { linkRecipe, MOCK_STATES, readPlan, RECIPE_VERSION } from "@maple-kit/core/mock";

import { flagType } from "../flag-source.js";
import { seenFlags } from "../flags.js";
import { installedMock } from "../handle.js";
import { realIdentity } from "../identity.js";
import { forgetRecipe, keepRecipeCookie, saveRecipe } from "../link.js";
import { pathPattern } from "../rest.js";
import { PlanUnavailableError } from "../schema/plan.js";
import { PLAN_DEBOUNCE_MS, PLAN_MIN_LENGTH, planCall } from "./plan.js";

import type { SeenFlag } from "../flags.js";
import type { MockHandle } from "../interceptor.js";
import type { Scheme, ThemeView } from "@maple-kit/core/client";
import type { MockSuggestion, PlanReading } from "@maple-kit/core/mock";
import type { FlagValue, IdentityRules, MockIdentity } from "@maple-kit/core/mock";
import type { MockCall, MockState, Recipe, ShapeSource } from "@maple-kit/core/mock";

/** What the client attaches to. `window` satisfies it. */
export interface MockView extends ThemeView {
  readonly location: Pick<Location, "href" | "pathname" | "assign" | "protocol">;
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
  /** False keeps the field a filter even where the route plans. */
  readonly plan?: boolean;
  /** How long typing pauses before a sentence is planned. Defaults to 500 ms. */
  readonly planDebounceMs?: number;
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

/** One flag the box offers: its real value, and what the draft sets it to. */
export interface MockFlagRow {
  readonly key: string;
  readonly type: SeenFlag["type"];
  /** Its real value, when the page evaluated it. */
  readonly value?: FlagValue;
  readonly variants?: readonly FlagValue[];
  /** What the draft answers it with; absent, it keeps its real value. */
  readonly set?: FlagValue;
  /** False for a flag the draft names that this page has not evaluated. */
  readonly seen: boolean;
}

/** The reviewer's real role and permissions, which a surface draws as the defaults. */
export interface RealAs {
  readonly role?: string;
  readonly permissions: readonly string[];
}

/** Everything a surface draws. Replaced whole on a change. */
export interface MockClientState {
  /** False when no transport is installed: a surface draws nothing. */
  readonly installed: boolean;
  readonly open: boolean;
  /** What the box's field holds: a sentence to plan, or words to filter by. */
  readonly query: string;
  /** True when the field is read as a sentence, since the route plans one. */
  readonly planning: boolean;
  /** At most two chips for the sentence, and none it was unsure of. */
  readonly suggestions: readonly MockSuggestion[];
  /** True when the sentence was read, confidently, as naming no state. */
  readonly unnamed: boolean;
  /** True while the route is reading the sentence, and not while it is typed. */
  readonly thinking: boolean;
  /** The sentence behind the draft, once a chip put it there. */
  readonly request: string | undefined;
  /** The page's route pattern, which a recipe applied from here is scoped to. */
  readonly route: string;
  /** The calls, most recent first; filtered by the query when nothing plans. */
  readonly calls: readonly MockCallRow[];
  /** What Apply would put in force. Starts as the active recipe's calls. */
  readonly draft: readonly MockCall[];
  /** The recipe in force on this route, which the banner names. */
  readonly active: Recipe | undefined;
  /** True when the draft differs from what is in force. */
  readonly changed: boolean;
  /** The flags the page evaluated, then any the draft names that it did not. */
  readonly flags: readonly MockFlagRow[];
  /** What Apply would answer flags with. Starts as the active recipe's. */
  readonly draftFlags: Readonly<Record<string, FlagValue>>;
  /** The host's rules for who the page is told the reviewer is, once read. */
  readonly identity: IdentityRules | undefined;
  /** Who Apply would tell the page the reviewer is. Starts as the active recipe's. */
  readonly draftAs: MockIdentity | undefined;
  /** Who the reviewer really is, as the identity call last answered, once it has. */
  readonly realAs: RealAs | undefined;
  /** How many writes reached the server, which acts as the reviewer, under `as`. */
  readonly writes: number;
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
  /**
   * The field's words. Where the route plans, its best reading goes into the
   * draft over what was there before the sentence; emptied, it puts that back.
   */
  setQuery(query: string): void;
  /** Puts a call in a state, or takes it out of the draft when undefined. */
  choose(key: string, state: MockState | undefined): void;
  /** Answers a flag with `value`, or lets it keep its real value when undefined. */
  setFlag(key: string, value: FlagValue | undefined): void;
  /** Shows the page this role, or its real one when undefined. */
  setRole(role: string | undefined): void;
  /** Grants or takes away a permission, or leaves it as it really is when undefined. */
  setPermission(name: string, granted: boolean | undefined): void;
  /** Empties the draft: no calls, no flags, no identity. */
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
  /** The pending plan: its timer and its request. */
  planTimer?: ReturnType<typeof setTimeout>;
  planFlight?: AbortController;
  /** Set once the route says it plans nothing, for the page's life. */
  planOff?: boolean;
  /** The draft before the sentence, which each reading is applied over. */
  base?: Draft;
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
  const active = activeOn(runtime, routeOf(view));
  runtime.state = derive(runtime, {
    draft: active?.calls ?? [],
    draftFlags: active?.flags ?? {},
    draftAs: active?.as,
  });

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
      cancelPlan(runtime);
    },
    setOpen: (open) => patch(runtime, { open }),
    toggle: () => patch(runtime, { open: !runtime.state.open }),
    setQuery(query) {
      patch(runtime, { query });
      if (query.trim() === "") restore(runtime);
      schedulePlan(runtime);
    },
    choose: (key, state) => edit(runtime, { draft: chosen(runtime.state.draft, key, state) }),
    setFlag: (key, value) =>
      edit(runtime, { draftFlags: withEntry(runtime.state.draftFlags, key, value) }),
    setRole: (role) => edit(runtime, { draftAs: withRole(runtime.state.draftAs, role) }),
    setPermission: (name, granted) =>
      edit(runtime, { draftAs: withPermission(runtime.state.draftAs, name, granted) }),
    clear: () =>
      edit(runtime, { draft: [], draftFlags: {}, draftAs: undefined, request: undefined }),
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
    planning: false,
    suggestions: [],
    unnamed: false,
    thinking: false,
    request: undefined,
    route: "/",
    calls: [],
    draft: [],
    active: undefined,
    changed: false,
    flags: [],
    draftFlags: {},
    identity: undefined,
    draftAs: undefined,
    realAs: undefined,
    writes: 0,
    scheme: "light",
  };
}

/** Recomputes everything read off the page and the handle, around `next`. */
function derive(runtime: Runtime, next: Partial<MockClientState>): MockClientState {
  const merged = { ...runtime.state, ...next, planning: plans(runtime) };
  const route = routeOf(runtime.view);
  const active = activeOn(runtime, route);
  return {
    ...merged,
    installed: runtime.handle !== undefined,
    route,
    active,
    calls: rows(runtime, route, merged),
    flags: flagRows(merged.draftFlags),
    realAs: realAsOn(runtime, route, merged.identity),
    writes: runtime.handle?.writes?.list().length ?? 0,
    changed: changed(merged, active),
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
  const refresh = () => patch(runtime, {});
  const unsubscribe = [
    handle?.inventory.subscribe(refresh),
    handle === undefined ? undefined : seenFlags().subscribe(refresh),
    handle?.writes?.subscribe(refresh),
  ];
  void handle?.identity?.().then((identity) => identity && patch(runtime, { identity }));

  view.addEventListener("popstate", () => patch(runtime, {}), { signal });
  if (handle !== undefined && options.shortcut !== false) {
    view.document.addEventListener("keydown", (event) => onKeydown(runtime, event), { signal });
    watchEscape({ view: view.document, signal, onEscape: () => patch(runtime, { open: false }) });
  }

  runtime.stop = () => {
    abort.abort();
    theme.stop();
    for (const stop of unsubscribe) stop?.();
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

/** Whether the field is a sentence: the route plans, and nobody switched it off. */
function plans(runtime: Runtime): boolean {
  return runtime.handle?.plan !== undefined && runtime.options.plan !== false && !runtime.planOff;
}

function cancelPlan(runtime: Runtime): void {
  if (runtime.planTimer !== undefined) clearTimeout(runtime.planTimer);
  delete runtime.planTimer;
  if (runtime.planFlight === undefined) return;
  runtime.planFlight.abort();
  delete runtime.planFlight;
  patch(runtime, { thinking: false });
}

const QUIET: PlanReading & { thinking: false } = {
  suggestions: [],
  unnamed: false,
  thinking: false,
};

/** A keystroke: restarts the wait and abandons whatever plan was in flight. */
function schedulePlan(runtime: Runtime): void {
  cancelPlan(runtime);
  if (!runtime.state.planning) return;
  const sentence = runtime.state.query.trim();
  if (sentence.length < PLAN_MIN_LENGTH) return patch(runtime, QUIET);

  const wait = runtime.options.planDebounceMs ?? PLAN_DEBOUNCE_MS;
  runtime.planTimer = setTimeout(() => void runPlan(runtime, sentence), wait);
}

/** A failure is swallowed: the box keeps working, and no chip arrives. */
async function runPlan(runtime: Runtime, sentence: string): Promise<void> {
  const lookup = runtime.handle?.plan;
  if (lookup === undefined) return;
  const flight = new AbortController();
  runtime.planFlight = flight;
  patch(runtime, { thinking: true });
  const { route } = runtime.state;
  const calls = (runtime.handle?.inventory.calls(route) ?? []).map(planCall);
  const flags = seenFlags()
    .list()
    .map(({ key, type, variants }) => ({
      key,
      type,
      ...(variants === undefined ? {} : { variants }),
    }));

  try {
    const asked = { request: sentence, route, calls, ...(flags.length === 0 ? {} : { flags }) };
    const plan = await lookup(asked, flight.signal);
    if (!flight.signal.aborted) read(runtime, readPlan(plan));
  } catch (error) {
    if (error instanceof PlanUnavailableError) runtime.planOff = true;
    if (!flight.signal.aborted) patch(runtime, QUIET);
  } finally {
    if (runtime.planFlight === flight) delete runtime.planFlight;
  }
}

type Draft = Pick<MockClientState, "draft" | "draftFlags" | "draftAs">;

/** A reading lands: its best suggestion over the draft as it was before the sentence. */
function read(runtime: Runtime, reading: PlanReading): void {
  patch(runtime, { ...reading, thinking: false });
  const [best] = reading.suggestions;
  if (best === undefined) {
    if (reading.unnamed) restore(runtime);
    return;
  }
  const base = (runtime.base ??= pick(runtime.state));
  const draft =
    best.state === undefined
      ? base.draft
      : best.calls.reduce((next, key) => chosen(next, key, best.state), base.draft);
  const role = best.as?.role;
  patch(runtime, {
    draft,
    draftFlags: { ...base.draftFlags, ...best.flags },
    draftAs: role === undefined ? base.draftAs : withRole(base.draftAs, role),
    request: runtime.state.query.trim(),
  });
}

/** The field emptied, or a sentence naming nothing: the draft goes back. */
function restore(runtime: Runtime): void {
  const { base } = runtime;
  if (base === undefined) return;
  delete runtime.base;
  patch(runtime, { ...base, request: undefined, suggestions: [], unnamed: false });
}

/** A change by hand: what the sentence put there is the reviewer's now. */
function edit(runtime: Runtime, next: Partial<Draft & { request: undefined }>): void {
  delete runtime.base;
  patch(runtime, next);
}

function pick(state: MockClientState): Draft {
  return { draft: state.draft, draftFlags: state.draftFlags, draftAs: state.draftAs };
}

/** Read from the identity call's last real answer; a mocked answer is never recorded. */
function realAsOn(runtime: Runtime, route: string, rules: IdentityRules | undefined) {
  const sample = rules && runtime.handle?.inventory.sample(rules.call, route);
  if (rules === undefined || sample === undefined) return undefined;
  const real = realIdentity(sample.body, rules);
  return {
    ...(real.role === undefined ? {} : { role: real.role }),
    permissions: [...(real.permissions ?? [])],
  };
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
  const words = state.planning ? [] : state.query.toLowerCase().split(/\s+/).filter(Boolean);

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

/** The flags evaluated, most recent first, then those only the draft names. */
function flagRows(draft: Readonly<Record<string, FlagValue>>): MockFlagRow[] {
  const seen = seenFlags().list().toReversed();
  const named = Object.entries(draft).filter(([key]) => !seen.some((flag) => flag.key === key));
  return [
    ...seen.map((flag): MockFlagRow => {
      const set = draft[flag.key];
      return { ...flag, seen: true, ...(set === undefined ? {} : { set }) };
    }),
    ...named.map(([key, set]): MockFlagRow => ({ key, type: flagType(set), set, seen: false })),
  ];
}

function withEntry<V>(record: Readonly<Record<string, V>>, key: string, value: V | undefined) {
  const next = Object.fromEntries(Object.entries(record).filter(([name]) => name !== key));
  return value === undefined ? next : { ...next, [key]: value };
}

function withRole(as: MockIdentity | undefined, role: string | undefined) {
  const permissions = as?.permissions;
  return layer({
    ...(role === undefined ? {} : { role }),
    ...(permissions === undefined ? {} : { permissions }),
  });
}

function withPermission(as: MockIdentity | undefined, name: string, granted: boolean | undefined) {
  const permissions = withEntry(as?.permissions ?? {}, name, granted);
  const role = as?.role;
  return layer({
    ...(role === undefined ? {} : { role }),
    ...(Object.keys(permissions).length === 0 ? {} : { permissions }),
  });
}

/** An identity that says nothing is no identity at all. */
function layer(as: MockIdentity): MockIdentity | undefined {
  return as.role === undefined && as.permissions === undefined ? undefined : as;
}

function changed(state: MockClientState, active: Recipe | undefined): boolean {
  return (
    !sameCalls(state.draft, active?.calls ?? []) ||
    !sameJson(state.draftFlags, active?.flags ?? {}) ||
    !sameJson(state.draftAs ?? {}, active?.as ?? {})
  );
}

/** Equal as JSON, whatever order the keys were set in. */
function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([key, inner]) => [key, sorted(inner)]),
  );
}

function sameCalls(a: readonly MockCall[], b: readonly MockCall[]): boolean {
  if (a.length !== b.length) return false;
  const byKey = new Map(b.map((call) => [call.key, call.state]));
  return a.every((call) => byKey.get(call.key) === call.state);
}

function recipeOf(state: MockClientState): Recipe | undefined {
  const { draft: calls, draftAs: as, draftFlags: flags, request, route } = state;
  const flagged = Object.keys(flags).length > 0;
  if (calls.length === 0 && !flagged && as === undefined) return undefined;
  return {
    version: RECIPE_VERSION,
    calls,
    ...(flagged ? { flags } : {}),
    ...(as === undefined ? {} : { as }),
    route,
    ...(request === undefined ? {} : { request }),
  };
}

function apply(runtime: Runtime): void {
  const recipe = recipeOf(runtime.state);
  if (recipe === undefined) return turnOff(runtime);
  const storage = tabStorage(runtime.view);
  if (storage !== undefined) saveRecipe(storage, recipe);
  keepRecipeCookie(runtime.view, recipe);
  if (runtime.view) navigateOnPurpose(runtime.view, linkRecipe(hrefOf(runtime), recipe).href);
}

function turnOff(runtime: Runtime): void {
  const storage = tabStorage(runtime.view);
  if (storage !== undefined) forgetRecipe(storage);
  keepRecipeCookie(runtime.view, undefined);
  if (runtime.view) navigateOnPurpose(runtime.view, linkRecipe(hrefOf(runtime), undefined).href);
}

async function copyDraft(runtime: Runtime, write: (recipe: Recipe) => string): Promise<void> {
  const recipe = recipeOf(runtime.state);
  if (recipe === undefined) throw new MockClipboardError("The draft is empty: nothing to copy.");
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
