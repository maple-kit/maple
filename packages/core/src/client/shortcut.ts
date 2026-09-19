/**
 * The one bare-key shortcut: `c` starts a comment.
 *
 * A bare key has to check its modifiers. `Ctrl`+`C` is copy, and the first
 * build of this fired on the key alone, so copying a paragraph closed the
 * composer. It also has to check where the key landed: a reviewer typing `c`
 * into the host application's own search box is typing, not commenting.
 */

/** The key, so a binding can name it in a tooltip without repeating the letter. */
export const COMMENT_SHORTCUT = "c";

/** The parts of a keyboard event this decision needs. Structural, so it tests flat. */
export interface ShortcutEvent {
  readonly key: string;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly defaultPrevented?: boolean;
  readonly target?: unknown;
}

const TYPING_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA"]);

/** True when this keystroke means "start a comment" and nothing else. */
export function opensComposer(event: ShortcutEvent, key: string = COMMENT_SHORTCUT): boolean {
  if (event.key.toLowerCase() !== key.toLowerCase()) return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (event.defaultPrevented) return false;
  return !isEditable(event.target);
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
 * of the time the overlay is open.
 */
export function watchEscape(options: EscapeOptions): void {
  const view = options.view ?? document;
  const when = options.signal === undefined ? {} : { signal: options.signal };

  view.addEventListener(
    "keydown",
    (event: Event) => {
      if ((event as KeyboardEvent).key === "Escape") options.onEscape();
    },
    { capture: true, ...when },
  );
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
