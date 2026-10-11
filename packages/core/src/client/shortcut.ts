/**
 * The shortcuts: a tap of the platform modifier starts a comment, and a bare
 * `m` opens the mock box.
 *
 * A letter fails on a non-Latin layout (the Hebrew `c` key types a different
 * character), and a lone modifier does not. A tap has to check what else
 * happened while it was down: `Cmd`+`C` is copy, and a bare `m` has to check
 * where it landed, because a reviewer typing into the host's search box is
 * typing, not commenting.
 */

/** The key that opens Maple Mock's box. */
export const MOCK_SHORTCUT = "m";

/** Longest a modifier may stay down and still count as a tap. */
export const TAP_MS = 500;

/** The modifier whose tap starts a comment. */
export type TapModifier = "Meta" | "Control";

/** Where `navigator` says the platform is. Injectable so a test picks one. */
export interface PlatformSource {
  readonly userAgentData?: { readonly platform?: string };
  readonly platform?: string;
}

/** `Meta` on macOS and iOS, `Control` everywhere else. */
export function commentModifier(source?: PlatformSource): TapModifier {
  const nav = source ?? (globalThis as { navigator?: PlatformSource }).navigator;
  const platform = nav?.userAgentData?.platform ?? nav?.platform ?? "";
  return /mac|iphone|ipad/i.test(platform) ? "Meta" : "Control";
}

/** What a tooltip says: "Tap ⌘" on a Mac, "Tap Ctrl" elsewhere. */
export function commentTapLabel(modifier: TapModifier = commentModifier()): string {
  return modifier === "Meta" ? "Tap \u2318" : "Tap Ctrl";
}

/** What the tap state machine is fed. `at` is a millisecond clock. */
export interface TapInput {
  readonly type: "keydown" | "keyup" | "pointerdown" | "wheel" | "blur";
  readonly at: number;
  readonly key?: string;
  readonly repeat?: boolean;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
  /** Whether focus is somewhere a person types. */
  readonly editable?: boolean;
}

/** `downAt` is when the modifier went down, or null; `spoiled` means something else happened. */
export interface TapState {
  readonly downAt: number | null;
  readonly spoiled: boolean;
}

export const TAP_IDLE: TapState = { downAt: null, spoiled: false };

/** The next state, and whether this input completed a tap. */
export interface TapStep {
  readonly state: TapState;
  readonly fire: boolean;
}

/** True when a modifier other than `modifier` is held on this event. */
function othersHeld(input: TapInput, modifier: TapModifier): boolean {
  const other = modifier === "Meta" ? input.ctrlKey : input.metaKey;
  return Boolean(input.altKey || input.shiftKey || other);
}

function spoil(state: TapState): TapStep {
  return { state: state.downAt === null ? state : { ...state, spoiled: true }, fire: false };
}

function onKeydown(state: TapState, input: TapInput, modifier: TapModifier): TapStep {
  if (input.key !== modifier) return spoil(state);
  if (state.downAt !== null) return { state, fire: false };
  const spoiled = othersHeld(input, modifier) || input.editable === true;
  return { state: { downAt: input.at, spoiled }, fire: false };
}

function onKeyup(state: TapState, input: TapInput, modifier: TapModifier): TapStep {
  if (input.key !== modifier) return { state, fire: false };
  const { downAt, spoiled } = state;
  const quick = downAt !== null && input.at - downAt < TAP_MS;
  const fire = quick && !spoiled && !input.editable && !othersHeld(input, modifier);
  return { state: TAP_IDLE, fire };
}

/**
 * Pure: a modifier tap is a keydown and keyup of it with nothing between. A
 * repeat of the modifier is not "something between"; any other key, a pointer
 * press or a blur is, and so is a long hold or a second modifier.
 */
export function tapStep(state: TapState, input: TapInput, modifier: TapModifier): TapStep {
  if (input.type === "keydown") return onKeydown(state, input, modifier);
  if (input.type === "keyup") return onKeyup(state, input, modifier);
  if (input.type === "blur") return { state: TAP_IDLE, fire: false };
  return spoil(state);
}

/** How a surface asks to be told about a tap. */
export interface TapOptions {
  onTap(): void;
  /** Defaults to this platform's modifier. */
  readonly modifier?: TapModifier;
  /** What the listeners attach to. Defaults to the page's own window. */
  readonly view?: {
    addEventListener(
      type: string,
      listener: EventListener,
      options?: AddEventListenerOptions,
    ): void;
  };
  readonly signal?: AbortSignal;
}

/** Listens for the comment tap until the signal aborts. */
export function watchCommentTap(options: TapOptions): void {
  const view = options.view ?? window;
  const modifier = options.modifier ?? commentModifier();
  const when = options.signal === undefined ? {} : { signal: options.signal };
  let state = TAP_IDLE;

  const feed = (event: Event, type: TapInput["type"]): void => {
    const key = event as KeyboardEvent;
    const step = tapStep(
      state,
      {
        type,
        at: event.timeStamp,
        key: key.key,
        repeat: key.repeat,
        metaKey: key.metaKey,
        ctrlKey: key.ctrlKey,
        altKey: key.altKey,
        shiftKey: key.shiftKey,
        editable: isEditable(typedInto(event as unknown as ShortcutEvent)),
      },
      modifier,
    );
    state = step.state;
    if (step.fire) options.onTap();
  };

  const capture = { capture: true, ...when };
  for (const type of ["keydown", "keyup", "pointerdown", "wheel"] as const) {
    view.addEventListener(type, (event) => feed(event, type), capture);
  }
  view.addEventListener("blur", () => (state = TAP_IDLE), when);
}

/** The parts of a keyboard event this decision needs. Structural, so it tests flat. */
export interface ShortcutEvent {
  readonly key: string;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly defaultPrevented?: boolean;
  readonly target?: unknown;
  /** A shadow root retargets `target` to its host; the path's head is what was typed into. */
  readonly composedPath?: () => readonly unknown[];
}

const TYPING_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

/** True when this keystroke means "open the mock box" and nothing else. */
export function opensMock(event: ShortcutEvent, key: string = MOCK_SHORTCUT): boolean {
  return pressed(event, key);
}

function pressed(event: ShortcutEvent, key: string): boolean {
  if (event.key.toLowerCase() !== key.toLowerCase()) return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (event.defaultPrevented) return false;
  return !isEditable(typedInto(event));
}

/**
 * What the key landed on. A listener on the document sees a key typed into a
 * shadow root as landing on its host, which is a `div` and not editable.
 */
function typedInto(event: ShortcutEvent): unknown {
  const path = event.composedPath?.();
  return path !== undefined && path.length > 0 ? path[0] : event.target;
}

/** How a surface asks to be told about Escape. */
export interface EscapeOptions {
  /** The one thing to shut, decided by the caller in its own order. */
  onEscape(): void;
  /** What the listener attaches to. Defaults to the page's own document. */
  readonly view?: { addEventListener: Document["addEventListener"] };
  readonly signal?: AbortSignal;
}

/**
 * Escape, wherever the focus is. A surface that only hears it while focused
 * cannot be shut by a reviewer who clicked back onto the page, which is most
 * of the time the overlay is open. An open menu owns its own Escape.
 */
export function watchEscape(options: EscapeOptions): void {
  const view = options.view ?? document;
  const when = options.signal === undefined ? {} : { signal: options.signal };

  view.addEventListener(
    "keydown",
    (event: Event) => {
      if ((event as KeyboardEvent).key !== "Escape" || inOpenMenu(event)) return;
      options.onEscape();
    },
    { capture: true, ...when },
  );
}

/** A `popover="auto"` closes itself on Escape, and nothing under it should too. */
function inOpenMenu(event: Event): boolean {
  return event
    .composedPath()
    .some((node) => (node as Element).matches?.('[popover="auto"]:popover-open') === true);
}

/**
 * True for anywhere a person could be typing, including a `contenteditable`
 * host the browser has not told us is focused.
 */
export function isEditable(target: unknown): boolean {
  if (typeof target !== "object" || target === null) return false;
  const element = target as {
    tagName?: unknown;
    isContentEditable?: unknown;
    getAttribute?: (name: string) => string | null;
  };

  if (element.isContentEditable === true) return true;
  if (typeof element.tagName === "string" && TYPING_TAGS.has(element.tagName.toUpperCase())) {
    return true;
  }
  const editable = element.getAttribute?.("contenteditable");
  return typeof editable === "string" && editable !== "false";
}
