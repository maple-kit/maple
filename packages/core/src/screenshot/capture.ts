/**
 * Capturing what the browser is showing.
 *
 * Through snapdom, an optional peer imported only when a capture is asked for.
 * It re-renders the DOM rather than reading the compositor, so a cross-origin
 * image, a canvas, a video frame and anything drawn by the GPU come out wrong
 * or blank. That is why the paste path exists.
 */

/** How much around the element to include. */
export interface CaptureOptions {
  /**
   * The whole page rather than a widening from the element: two picks a few
   * hundred pixels apart widen to the same ancestor anyway.
   */
  readonly page?: boolean;
  /** Ancestors to widen to, for context around the element. Defaults to 2. */
  readonly ancestors?: number;
  /** Device pixel ratio to render at. Defaults to the display's. */
  readonly scale?: number;
  /** Image format. Defaults to PNG; snapdom's own default is SVG. */
  readonly format?: "jpeg" | "png" | "webp";
}

/** Raised when a capture cannot be made, saying what to do instead. */
export class CaptureUnavailableError extends Error {
  override readonly name = "CaptureUnavailableError";

  constructor(cause: string) {
    super(`${cause} Attach a screenshot instead: Maple accepts a pasted or dropped image.`);
  }
}

interface Snapdom {
  toBlob(element: Element, options: Record<string, unknown>): Promise<Blob>;
}

const DEFAULT_ANCESTORS = 2;

/**
 * Renders `element` and a couple of its ancestors to an image.
 *
 * Throws {@link CaptureUnavailableError} rather than returning a blank image,
 * because a blank screenshot attached to a comment is worse than none: it
 * looks like evidence.
 */
export async function captureElement(
  element: Element,
  options: CaptureOptions = {},
): Promise<Blob> {
  const snapdom = await load();
  const target =
    options.page === true
      ? pageOf(element)
      : widen(element, options.ancestors ?? DEFAULT_ANCESTORS);

  const blob = await snapdom.toBlob(target, {
    scale: options.scale ?? window.devicePixelRatio,
    type: options.format ?? "png",
  });

  if (blob.size === 0) throw new CaptureUnavailableError("The capture came out empty.");
  return blob;
}

async function load(): Promise<Snapdom> {
  const loaded = await imported();
  if (typeof loaded.snapdom?.toBlob !== "function") {
    throw new CaptureUnavailableError("snapdom is installed but exposes no toBlob.");
  }
  return loaded.snapdom as Snapdom;
}

/** snapdom is an optional peer, so the import itself is the thing that fails. */
async function imported(): Promise<{ snapdom?: { toBlob?: unknown } }> {
  try {
    return await import("@zumer/snapdom");
  } catch {
    throw new CaptureUnavailableError("snapdom is not installed, so Maple cannot capture.");
  }
}

/** The element's own page, which is its document's body. */
function pageOf(element: Element): Element {
  return element.ownerDocument.body;
}

/** Walks up for context, stopping at the body rather than capturing the page. */
function widen(element: Element, ancestors: number): Element {
  let target = element;
  for (let step = 0; step < ancestors; step += 1) {
    const parent = target.parentElement;
    if (!parent || parent === document.body || parent === document.documentElement) break;
    target = parent;
  }
  return target;
}
