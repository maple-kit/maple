/**
 * Choosing what a comment is about: an element, a passage, or a rectangle.
 *
 * All three ignore the overlay itself. Without that, the first thing a
 * reviewer picks is Maple's own sidebar.
 */

import { OVERLAY_MARKER } from "../anchor/text-position.js";

/** A rectangle in viewport coordinates. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** What a reviewer chose. */
export type Pick =
  | { readonly kind: "element"; readonly element: Element; readonly rect: Rect }
  | { readonly kind: "region"; readonly rect: Rect }
  | { readonly kind: "text"; readonly range: Range; readonly rect: Rect };

/** The smallest drag that counts as a rectangle rather than a click. */
export const MINIMUM_REGION = 8;

/** The topmost element under a point that is not Maple's own. */
export function elementAt(x: number, y: number): Element | undefined {
  for (const candidate of document.elementsFromPoint(x, y)) {
    if (!candidate.closest(`[${OVERLAY_MARKER}]`)) return candidate;
  }
  return undefined;
}

/** The current text selection, when there is one and it is not in the overlay. */
export function selectedText(): Pick | undefined {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return undefined;

  const range = selection.getRangeAt(0);
  const element =
    range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
  if (!element || element.closest(`[${OVERLAY_MARKER}]`)) return undefined;

  return { kind: "text", range, rect: rectOf(range.getBoundingClientRect()) };
}

/**
 * True for an event the picker must not act on.
 *
 * The overlay's own controls are the case this exists for. They live in a
 * shadow root, so `elementsFromPoint` reports the host for them and the skip
 * above hands back whatever is *behind* the control — which turns a click on
 * the picker's own Cancel button into a pick of the page under it. Only the
 * caller knows its shadow root, so only the caller can answer this.
 */
export type IgnoreEvent = (event: Event) => boolean;

/** How element picking reports what it finds. */
export interface ElementPickingOptions {
  /** Called as the pointer moves, so the caller can draw a highlight. */
  onHover?(pick: Pick | undefined): void;
  onPick(pick: Pick): void;
  /** Events over the caller's own controls, which are never a pick. */
  readonly ignore?: IgnoreEvent;
  /** Aborting removes every listener. */
  readonly signal?: AbortSignal;
}

/** Highlights what is under the pointer and reports what is clicked. */
export function startElementPicking(options: ElementPickingOptions): void {
  const listen = listener(options.signal);
  const ignored = options.ignore ?? (() => false);

  listen("pointermove", (event) => {
    options.onHover?.(ignored(event) ? undefined : elementPick(event));
  });
  listen("click", (event) => {
    if (ignored(event)) return;
    const pick = elementPick(event);
    if (!pick) return;
    event.preventDefault();
    event.stopPropagation();
    options.onPick(pick);
  });
}

/** How region picking reports what it finds. */
export interface RegionPickingOptions {
  onDraw?(rect: Rect): void;
  onPick(pick: Pick): void;
  /** Events over the caller's own controls, which never start a rectangle. */
  readonly ignore?: IgnoreEvent;
  readonly signal?: AbortSignal;
}

/**
 * Reports the rectangle a reviewer drags. A drag under {@link MINIMUM_REGION}
 * is a click that missed, not a rectangle, and is dropped.
 */
export function startRegionPicking(options: RegionPickingOptions): void {
  const listen = listener(options.signal);
  const ignored = options.ignore ?? (() => false);
  let origin: { x: number; y: number } | undefined;

  listen("pointerdown", (event) => {
    if (ignored(event)) return;
    origin = { x: event.clientX, y: event.clientY };
  });

  listen("pointermove", (event) => {
    if (origin) options.onDraw?.(between(origin, event));
  });

  listen("pointerup", (event) => {
    if (!origin) return;
    const rect = between(origin, event);
    origin = undefined;
    if (rect.width >= MINIMUM_REGION && rect.height >= MINIMUM_REGION) {
      options.onPick({ kind: "region", rect });
    }
  });
}

/** How text picking reports what it finds. */
export interface TextPickingOptions {
  /** Called as the selection changes, so the caller can draw it. */
  onHover?(pick: Pick | undefined): void;
  onPick(pick: Pick): void;
  /** Events over the caller's own controls, which never commit a passage. */
  readonly ignore?: IgnoreEvent;
  readonly signal?: AbortSignal;
}

/**
 * Commits a passage when the pointer comes up, not on every selection change:
 * a selection is still being made while it is dragged, and committing its
 * first character is how a reviewer ends up quoting one letter.
 */
export function startTextPicking(options: TextPickingOptions): void {
  const ignored = options.ignore ?? (() => false);
  const listen = document.addEventListener.bind(document);
  const when = options.signal === undefined ? {} : { signal: options.signal };

  listen(
    "pointerup",
    (event: Event) => {
      if (ignored(event)) return;
      setTimeout(() => {
        const pick = selectedText();
        if (pick) options.onPick(pick);
      }, 0);
    },
    when,
  );

  listen("selectionchange", () => options.onHover?.(selectedText()), when);
}

/** What the picker's own keys do while a pick is armed. */
export interface PickKeyOptions {
  /** Escape: the way out that needs no control on screen. */
  onCancel(): void;
  /** `t`: the three kinds, cycled without going back to the island. */
  onCycle(): void;
  readonly signal?: AbortSignal;
}

/**
 * `c` opens comment mode and `Ctrl`+`C` is copy, so a bare key here checks its
 * modifiers for the same reason the shortcut in the controller does.
 */
export function watchPickKeys(options: PickKeyOptions): void {
  const when = options.signal === undefined ? {} : { signal: options.signal };

  document.addEventListener(
    "keydown",
    (event: KeyboardEvent) => {
      if (event.key === "Escape") return options.onCancel();
      if (event.key !== "t" || event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      options.onCycle();
    },
    { capture: true, ...when },
  );
}

type PointerName = "pointerdown" | "pointermove" | "pointerup";

function listener(signal: AbortSignal | undefined) {
  return (name: "click" | PointerName, handler: (event: PointerEvent | MouseEvent) => void) => {
    document.addEventListener(name, handler as EventListener, {
      capture: true,
      ...(signal === undefined ? {} : { signal }),
    });
  };
}

function elementPick(event: MouseEvent): Pick | undefined {
  const element = elementAt(event.clientX, event.clientY);
  return element
    ? { kind: "element", element, rect: rectOf(element.getBoundingClientRect()) }
    : undefined;
}

function between(origin: { x: number; y: number }, event: MouseEvent): Rect {
  return {
    x: Math.min(origin.x, event.clientX),
    y: Math.min(origin.y, event.clientY),
    width: Math.abs(event.clientX - origin.x),
    height: Math.abs(event.clientY - origin.y),
  };
}

function rectOf(rect: DOMRect): Rect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}
