/**
 * Four layers that keep an unsent comment, and the one place that asks.
 *
 * Three save and get out of the way: `beforeunload` is attached only while a
 * draft is dirty, `pushState` is patched to save, and `popstate` cannot be
 * cancelled. A same-origin anchor click is the one navigation that can still
 * be stopped, so it is the one that asks — once per draft, and through the
 * surface, because nothing here has a DOM opinion. `beforeunload` left
 * attached costs bfcache on every page, and that gets blamed on Maple.
 */

/** What was about to take the page away. */
export type LeaveReason = "anchor" | "history" | "popstate" | "unload";

/** Keep writing, or throw the draft away and follow the link. */
export type LeaveAnswer = "discard" | "keep";

/** The unsent draft a question is about. */
export interface LeaveSubject {
  /** Stable per draft, so a reviewer is asked about each one at most once. */
  readonly id: string;
  /** What a reviewer calls the thing it sits on: "the Yield card". */
  readonly label?: string;
}

/** What the surface is told, so it writes the copy rather than is handed it. */
export interface LeaveQuestion {
  readonly reason: LeaveReason;
  readonly subject: LeaveSubject;
  /** Where the click was going, absolute. */
  readonly href: string;
}

/**
 * How a surface is asked. Supplying one turns the anchor layer from "save and
 * go" into "save, ask once, then go or stay"; the guard still renders nothing
 * and still knows no words.
 */
export interface LeavePrompt {
  /** The unsent draft right now, or undefined when there is nothing to lose. */
  subject(): LeaveSubject | undefined;
  /** May answer later, so a rendered dialog is as usable as a native one. */
  ask(question: LeaveQuestion): LeaveAnswer | Promise<LeaveAnswer>;
  /** Throws the draft away. Called only after a `discard` answer. */
  discard(): void;
}

/** The window the guard attaches to. `window`, or a stub in a test. */
export interface NavigationView {
  readonly document: Document;
  readonly history: History;
  readonly location: {
    readonly href: string;
    readonly origin: string;
    /** Performs a navigation the guard prevented and the reviewer then allowed. */
    assign(url: string): void;
  };
  addEventListener(type: string, listener: EventListener, options?: AddEventListenerOptions): void;
  removeEventListener(type: string, listener: EventListener, options?: EventListenerOptions): void;
}

/** How the guard is wired to the draft it is protecting. */
export interface NavigationGuardOptions {
  readonly view: NavigationView;
  /** Writes whatever is pending, synchronously. Called on every layer. */
  save(): void;
  isDirty(): boolean;
  /** Called after the save, so a binding can say what was kept and where. */
  onLeave?(reason: LeaveReason): void;
  /**
   * Asked before a same-origin anchor click, once per draft. Left out, that
   * layer saves and lets every click through, as a headless caller wants.
   */
  readonly prompt?: LeavePrompt;
  /**
   * Let the browser ask before a hard exit. Off by default: the draft is
   * already on disk, and the native dialog is still a dialog.
   */
  readonly confirmOnUnload?: boolean;
}

/** A guard that can be attached, told about dirtiness, and detached cleanly. */
export interface NavigationGuard {
  start(): void;
  /** Adds or removes `beforeunload` so it exists exactly while it is needed. */
  setDirty(dirty: boolean): void;
  stop(): void;
}

/** Windows a Maple surface is taking away on the reviewer's say-so. */
const chosen = new WeakSet<object>();

/**
 * Goes to `url` because the reviewer chose to, such as Apply and reload. Every
 * guard on `view` still saves, and none asks the browser to confirm.
 */
export function navigateOnPurpose(
  view: { readonly location: { assign(url: string): void } },
  url: string,
): void {
  chosen.add(view);
  view.location.assign(url);
}

/** Builds the guard. Attaches nothing until `start()`. */
export function createNavigationGuard(options: NavigationGuardOptions): NavigationGuard {
  const { view } = options;
  let abort: AbortController | undefined;
  let attachedUnload = false;
  let restoreHistory: (() => void) | undefined;
  const asked = new Set<string>();

  const leave = (reason: LeaveReason): void => {
    if (options.isDirty()) options.save();
    options.onLeave?.(reason);
  };

  // Keep writing is the absence of an action: nothing closed, nothing moved,
  // so the composer still has the focus it had when the link was clicked.
  const onAnchor = (click: MouseEvent, link: HTMLAnchorElement): void => {
    const { prompt } = options;
    if (!prompt || !options.isDirty()) {
      leave("anchor");
      return;
    }

    const question = questionFor(prompt, asked, link);
    leave("anchor");
    if (!question) return;
    click.preventDefault();
    answer(prompt, question, view);
  };

  const onUnload = (event: Event): void => {
    leave("unload");
    const onPurpose = chosen.delete(view);
    if (options.confirmOnUnload && !onPurpose) event.preventDefault();
  };

  const setDirty = (dirty: boolean): void => {
    if (dirty === attachedUnload) return;
    attachedUnload = dirty;
    if (dirty) view.addEventListener("beforeunload", onUnload);
    else view.removeEventListener("beforeunload", onUnload);
  };

  return {
    start() {
      if (abort) return;
      abort = new AbortController();
      const { signal } = abort;

      view.document.addEventListener(
        "click",
        (event) => {
          const click = event as MouseEvent;
          const link = navigable(view, click);
          if (link) onAnchor(click, link);
        },
        { capture: true, signal },
      );
      view.addEventListener("popstate", () => leave("popstate"), { signal });
      restoreHistory = patchHistory(view.history, () => leave("history"));
    },
    setDirty,
    stop() {
      abort?.abort();
      abort = undefined;
      restoreHistory?.();
      restoreHistory = undefined;
      setDirty(false);
    },
  };
}

/**
 * The question this click raises, or none: a reviewer who already answered for
 * this draft and clicks again is not asking to be interrogated twice.
 */
function questionFor(
  prompt: LeavePrompt,
  asked: Set<string>,
  link: HTMLAnchorElement,
): LeaveQuestion | undefined {
  const subject = prompt.subject();
  if (!subject || asked.has(subject.id)) return undefined;

  asked.add(subject.id);
  return { reason: "anchor", subject, href: link.href };
}

/** The surface may take its time; a question it cannot put leaves the page be. */
function answer(prompt: LeavePrompt, question: LeaveQuestion, view: NavigationView): void {
  void Promise.resolve(prompt.ask(question)).then(
    (given) => {
      if (given !== "discard") return;
      prompt.discard();
      navigateOnPurpose(view, question.href);
    },
    () => undefined,
  );
}

/** A plain left click on a same-origin link, and nothing else, counts. */
function navigable(view: NavigationView, click: MouseEvent): HTMLAnchorElement | undefined {
  if (click.defaultPrevented || click.button !== 0) return undefined;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return undefined;

  const link = linkIn(click);
  if (!link || link.hasAttribute("download")) return undefined;
  if (link.target !== "" && link.target !== "_self") return undefined;
  if (new URL(link.href, view.location.href).origin !== view.location.origin) return undefined;

  return link;
}

/** The composed path, so a link inside a shadow root is still a link. */
function linkIn(event: MouseEvent): HTMLAnchorElement | undefined {
  for (const node of event.composedPath()) {
    if (node instanceof HTMLAnchorElement && node.href) return node;
  }
  return undefined;
}

/**
 * A single-page route change never unloads anything, so the only hook is the
 * two methods that perform it. They are patched to save, never to ask.
 */
function patchHistory(history: History, onChange: () => void): () => void {
  // Bound copies: the patch is removed by identity, so a library that patches
  // after Maple keeps its own wrapper rather than having it dropped.
  const original = {
    pushState: history.pushState.bind(history),
    replaceState: history.replaceState.bind(history),
  };

  const wrap = (name: "pushState" | "replaceState") =>
    function patched(...args: Parameters<History["pushState"]>): void {
      onChange();
      original[name](...args);
    };

  const installed = { pushState: wrap("pushState"), replaceState: wrap("replaceState") };
  history.pushState = installed.pushState;
  history.replaceState = installed.replaceState;

  return () => {
    if (history.pushState === installed.pushState) history.pushState = original.pushState;
    if (history.replaceState === installed.replaceState) {
      history.replaceState = original.replaceState;
    }
  };
}
