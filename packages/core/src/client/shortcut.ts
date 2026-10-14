/**
 * The shortcuts: a tap of the platform modifier starts a comment, a tap of it
 * with Shift closes Maple, and a bare `m` opens the mock box.
 *
 * A letter fails on a non-Latin layout (the Hebrew `c` key types a different
 * character), and a lone modifier does not. A tap has to check what else
 * happened while it was down: `Cmd`+`C` is copy, and a bare `m` has to check
 * where it landed, because a reviewer typing into the host's search box is
 * typing, not commenting.
 */

import { OVERLAY_MARKER } from "../anchor/text-position.js";

/** The key that opens Maple Mock's box. */
export const MOCK_SHORTCUT = "m";

/** Longest a modifier may stay down and still count as a tap. */
export const TAP_MS = 500;

/** The modifier whose tap starts a comment. */
export type TapModifier = "Meta" | "Alt";

/** Where `navigator` says the platform is. Injectable so a test picks one. */
export interface PlatformSource {
  readonly userAgentData?: { readonly platform?: string };
  readonly platform?: string;
}

/**
 * `Meta` on macOS and iOS, `Alt` everywhere else. Not `Control`: screen reader
 * users tap it to silence speech, and each tap would start a comment.
 */
export function commentModifier(source?: PlatformSource): TapModifier {
  const nav = source ?? (globalThis as { navigator?: PlatformSource }).navigator;
  const platform = nav?.userAgentData?.platform ?? nav?.platform ?? "";
  return /mac|iphone|ipad/i.test(platform) ? "Meta" : "Alt";
}

/** What a tooltip says: "Tap ⌘" on a Mac, "Tap Alt" elsewhere. */
export function commentTapLabel(modifier: TapModifier = commentModifier()): string {
  return modifier === "Meta" ? "Tap \u2318" : "Tap Alt";
}

/** What the tap state machine is fed. `at` is a millisecond clock. */
export interface TapInput {
  readonly type: "keydown" | "keyup" | "pointerdown" | "wheel" | "blur" | "hidden";
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

/**
 * `downAt` is when the modifier went down, or null; `spoiled` means something
 * else happened; `typing` means focus was in a text field when it went down.
 */
interface PlainState {
  readonly downAt: number | null;
  readonly spoiled: boolean;
  readonly typing: boolean;
}

/**
 * The close chord, Shift with the modifier. `start` is when the first of the
 * two went down; `mod` and `shift` say which are held now.
 */
export interface ChordState {
  readonly start: number | null;
  readonly mod: boolean;
  readonly shift: boolean;
  readonly spoiled: boolean;
}

/** The comment tap's state, and the close chord's beside it. */
export interface TapState extends PlainState {
  readonly chord: ChordState;
}

const PLAIN_IDLE: PlainState = { downAt: null, spoiled: false, typing: false };
const CHORD_IDLE: ChordState = { start: null, mod: false, shift: false, spoiled: false };

export const TAP_IDLE: TapState = {
  downAt: null,
  spoiled: false,
  typing: false,
  chord: CHORD_IDLE,
};

/** Why a quick, otherwise clean tap did not fire. Only a text field does this. */
export type TapIgnored = "editable";

/**
 * The next state, whether this input completed a comment tap, whether it
 * completed a Shift tap that closes Maple, and why a tap was ignored.
 */
export interface TapStep {
  readonly state: TapState;
  readonly fire: boolean;
  readonly close?: true;
  readonly ignored?: TapIgnored;
}

interface PlainStep {
  readonly state: PlainState;
  readonly fire: boolean;
  readonly ignored?: TapIgnored;
}

/** True when a modifier other than `modifier` or Shift is held on this event. */
function strayHeld(input: TapInput, modifier: TapModifier): boolean {
  const other = modifier === "Meta" ? input.altKey : input.metaKey;
  return Boolean(input.ctrlKey || other);
}

/** True when a modifier other than `modifier` is held on this event. */
function othersHeld(input: TapInput, modifier: TapModifier): boolean {
  return Boolean(input.shiftKey) || strayHeld(input, modifier);
}

function spoil(state: PlainState): PlainStep {
  return { state: state.downAt === null ? state : { ...state, spoiled: true }, fire: false };
}

/** Cmd+scroll zooms; a bare wheel, momentum included, is not a chord. */
function onWheel(state: PlainState, input: TapInput): PlainStep {
  return input.metaKey || input.ctrlKey ? spoil(state) : { state, fire: false };
}

/**
 * A repeat of the held modifier changes nothing. Any other keydown of it
 * starts over: the keyup that should have ended the last one never came.
 */
function onKeydown(state: PlainState, input: TapInput, modifier: TapModifier): PlainStep {
  if (input.key !== modifier) return spoil(state);
  if (state.downAt !== null && input.repeat) return { state, fire: false };
  const spoiled = othersHeld(input, modifier);
  return { state: { downAt: input.at, spoiled, typing: input.editable === true }, fire: false };
}

function onKeyup(state: PlainState, input: TapInput, modifier: TapModifier): PlainStep {
  if (input.key !== modifier) return { state, fire: false };
  const { downAt, spoiled, typing } = state;
  const quick = downAt !== null && input.at - downAt < TAP_MS;
  const clean = quick && !spoiled && !othersHeld(input, modifier);
  if (clean && (typing || input.editable)) {
    return { state: PLAIN_IDLE, fire: false, ignored: "editable" };
  }
  return { state: PLAIN_IDLE, fire: clean };
}

function plainStep(state: PlainState, input: TapInput, modifier: TapModifier): PlainStep {
  if (input.type === "keydown") return onKeydown(state, input, modifier);
  if (input.type === "keyup") return onKeyup(state, input, modifier);
  if (input.type === "blur" || input.type === "hidden") return { state: PLAIN_IDLE, fire: false };
  if (input.type === "wheel") return onWheel(state, input);
  return spoil(state);
}

type ChordKey = "mod" | "shift";

interface ChordStep {
  readonly state: ChordState;
  readonly fire: boolean;
}

/** Which of the chord's two keys an input names, if either. */
function chordName(input: TapInput, modifier: TapModifier): ChordKey | undefined {
  if (input.key === "Shift") return "shift";
  return input.key === modifier ? "mod" : undefined;
}

function pressChord(held: ChordState, name: ChordKey, input: TapInput, mod: TapModifier) {
  if (held[name] && input.repeat) return held;
  const lost = held.start !== null && input.at - held.start >= TAP_MS;
  const state = lost ? CHORD_IDLE : held;
  const first = state.start === null;
  const stray = first && strayHeld(input, mod);
  return {
    ...state,
    [name]: true,
    start: state.start ?? input.at,
    spoiled: state.spoiled || stray,
  };
}

function releaseChord(state: ChordState, name: ChordKey, at: number): ChordStep {
  const quick = state.start !== null && at - state.start < TAP_MS;
  const fire = state.mod && state.shift && !state.spoiled && quick;
  const next = { ...state, [name]: false };
  return { state: fire || !(next.mod || next.shift) ? CHORD_IDLE : next, fire };
}

/** Anything that is not the chord's own keys going up spoils a chord under way. */
function spoilChord(state: ChordState, input: TapInput): ChordStep {
  const bareWheel = input.type === "wheel" && !input.metaKey && !input.ctrlKey;
  if (input.type === "keyup" || bareWheel || state.start === null) return { state, fire: false };
  return { state: { ...state, spoiled: true }, fire: false };
}

/**
 * Pure: Shift and the modifier both down and let go with nothing between, quick.
 * A third key, a pointer press or a blur spoils it: Cmd+Shift+4 is a screenshot.
 */
function chordStep(state: ChordState, input: TapInput, modifier: TapModifier): ChordStep {
  if (input.type === "blur" || input.type === "hidden") return { state: CHORD_IDLE, fire: false };
  const name = chordName(input, modifier);
  if (name === undefined) return spoilChord(state, input);
  if (input.type === "keydown") {
    return { state: pressChord(state, name, input, modifier), fire: false };
  }
  if (input.type === "keyup") return releaseChord(state, name, input.at);
  return spoilChord(state, input);
}

/**
 * Pure: a modifier tap is a keydown and keyup of it with nothing between. A
 * repeat of the modifier is not "something between"; any other key, a pointer
 * press or a blur is, and so is a long hold or a second modifier. The same
 * with Shift held is a tap that closes.
 */
export function tapStep(state: TapState, input: TapInput, modifier: TapModifier): TapStep {
  const plain = plainStep(state, input, modifier);
  const chord = chordStep(state.chord, input, modifier);
  return {
    ...plain,
    state: { ...plain.state, chord: chord.state },
    ...(chord.fire ? { close: true as const } : {}),
  };
}

/** How a surface asks to be told about a tap. */
export interface TapOptions {
  onTap(): void;
  /** Shift and the modifier tapped together: close Maple. */
  readonly onClose?: () => void;
  /** A quick tap that a focused text field swallowed. */
  readonly onIgnored?: (reason: TapIgnored) => void;
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
        editable: typingIn(event as unknown as ShortcutEvent),
      },
      modifier,
    );
    state = step.state;
    if (step.fire) options.onTap();
    if (step.close) options.onClose?.();
    // An Alt keyup the page leaves alone focuses the browser's menu bar on Windows.
    if (type === "keyup" && modifier === "Alt" && (step.fire || step.close)) event.preventDefault();
    // Maple's own field is not the host's: no hint to click the page.
    if (step.ignored && !inMaple(event)) options.onIgnored?.(step.ignored);
  };

  const capture = { capture: true, ...when };
  for (const type of ["keydown", "keyup", "pointerdown", "wheel"] as const) {
    view.addEventListener(type, (event) => feed(event, type), capture);
  }
  view.addEventListener("blur", () => (state = TAP_IDLE), when);
  view.addEventListener(
    "visibilitychange",
    (event) => {
      if ((event.target as Partial<Document> | null)?.visibilityState === "hidden") {
        state = TAP_IDLE;
      }
    },
    when,
  );
}

/** True when the event landed in Maple's own overlay, shadow root included. */
function inMaple(event: Event): boolean {
  return event
    .composedPath()
    .some((node) => (node as Element).hasAttribute?.(OVERLAY_MARKER) === true);
}

/** The parts of a keyboard event this decision needs. Structural, so it tests flat. */
export interface ShortcutEvent {
  readonly key: string;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly defaultPrevented?: boolean;
  readonly repeat?: boolean;
  readonly isComposing?: boolean;
  readonly keyCode?: number;
  readonly target?: unknown;
  /** A shadow root retargets `target` to its host; the path's head is what was typed into. */
  readonly composedPath?: () => readonly unknown[];
}

const TYPING_TAGS = new Set(["SELECT", "TEXTAREA"]);

/** Input types that take typed text. Anything else a key does not type into. */
const NON_TEXT_INPUTS = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/** True when this keystroke means "open the mock box" and nothing else. */
export function opensMock(event: ShortcutEvent, key: string = MOCK_SHORTCUT): boolean {
  return pressed(event, key);
}

function pressed(event: ShortcutEvent, key: string): boolean {
  if (event.key.toLowerCase() !== key.toLowerCase()) return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (event.defaultPrevented) return false;
  // A held key would flicker the box; keyCode 229 is an IME still composing.
  if (event.repeat || event.isComposing || event.keyCode === 229) return false;
  return !typingIn(event);
}

/**
 * True when the key landed in an editor. A shadow root retargets to its host,
 * so the whole path is read, ancestors included.
 */
function typingIn(event: ShortcutEvent): boolean {
  const path = event.composedPath?.();
  if (path === undefined || path.length === 0) return isEditable(event.target);
  return path.some(isEditable);
}

/** How a surface asks to be told about Escape. */
export interface EscapeOptions {
  /** Shuts the topmost layer, and says whether there was one. Only then is the key taken. */
  onEscape(event: KeyboardEvent): boolean;
  /** True while Maple is in a mode that owns Escape wherever focus is, such as a pick. */
  readonly takesAll?: () => boolean;
  /** What the listener attaches to. Defaults to the page's own document. */
  readonly view?: { addEventListener: Document["addEventListener"] };
  readonly signal?: AbortSignal;
}

/**
 * Escape, but only Maple's own. It is heard when focus is inside the overlay,
 * or while `takesAll` says so; anywhere else the host's dialog or menu gets it
 * untouched. When a layer shuts, the key is consumed, so one press shuts one
 * thing and a host `<dialog>` is not asked to close as well.
 */
export function watchEscape(options: EscapeOptions): void {
  const view = options.view ?? document;
  const when = options.signal === undefined ? {} : { signal: options.signal };

  view.addEventListener(
    "keydown",
    (event: Event) => {
      const key = event as KeyboardEvent;
      if (key.key !== "Escape" || key.defaultPrevented || key.isComposing) return;
      const inside = inMaple(event);
      if (inside ? ownsEscape(event) : options.takesAll?.() !== true) return;
      if (!options.onEscape(key)) return;
      key.preventDefault();
      key.stopImmediatePropagation();
    },
    { capture: true, ...when },
  );
}

/**
 * Maple's own open `popover="auto"` or modal `<dialog>` closes itself on Escape.
 * Only the path inside the overlay counts: a host modal Maple sits in does not.
 */
function ownsEscape(event: Event): boolean {
  const open = '[popover="auto"]:popover-open, dialog:modal';
  const path = event.composedPath();
  const overlay = path.findIndex((node) => (node as Element).hasAttribute?.(OVERLAY_MARKER));
  return path.slice(0, overlay).some((node) => (node as Element).matches?.(open) === true);
}

const EDITOR_ROLES = new Set(["textbox", "combobox", "searchbox"]);

/**
 * True for anywhere a person could be typing, including a `contenteditable`
 * host the browser has not told us is focused and an ARIA editor.
 */
export function isEditable(target: unknown): boolean {
  if (typeof target !== "object" || target === null) return false;
  const element = target as {
    tagName?: unknown;
    isContentEditable?: unknown;
    type?: unknown;
    getAttribute?: (name: string) => string | null;
  };

  if (element.isContentEditable === true) return true;
  if (typeof element.tagName === "string") {
    const tag = element.tagName.toUpperCase();
    if (TYPING_TAGS.has(tag)) return true;
    if (tag === "INPUT") return takesText(element);
  }
  const role = element.getAttribute?.("role")?.trim().split(/\s+/)[0];
  if (role !== undefined && EDITOR_ROLES.has(role.toLowerCase())) return true;
  const editable = element.getAttribute?.("contenteditable");
  return typeof editable === "string" && editable !== "false";
}

/** An `<input>` types text unless its type is a button, a toggle or a picker. */
function takesText(element: { type?: unknown; getAttribute?: (n: string) => string | null }) {
  const attribute = element.getAttribute?.("type");
  const type = typeof element.type === "string" ? element.type : attribute;
  return typeof type !== "string" || !NON_TEXT_INPUTS.has(type.toLowerCase());
}
