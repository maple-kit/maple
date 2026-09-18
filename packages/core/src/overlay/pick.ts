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

/** How element picking reports what it finds. */
export interface ElementPickingOptions {
  /** Called as the pointer moves, so the caller can draw a highlight. */
  onHover?(pick: Pick | undefined): void;
  onPick(pick: Pick): void;
  /** Aborting removes every listener. */
  readonly signal?: AbortSignal;
}

/** Highlights what is under the pointer and reports what is clicked. */
export function startElementPicking(options: ElementPickingOptions): void {
  const listen = listener(options.signal);

  listen("pointermove", (event) => options.onHover?.(elementPick(event)));
  listen("click", (event) => {
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
  readonly signal?: AbortSignal;
}

/**
 * Reports the rectangle a reviewer drags. A drag under {@link MINIMUM_REGION}
 * is a click that missed, not a rectangle, and is dropped.
 */
export function startRegionPicking(options: RegionPickingOptions): void {
  const listen = listener(options.signal);
  let origin: { x: number; y: number } | undefined;

  listen("pointerdown", (event) => {
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
