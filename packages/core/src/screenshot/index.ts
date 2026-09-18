/**
 * Screenshots, in the order they are worth trying.
 *
 * The pasted image is first. Client capture re-renders the DOM rather than
 * reading the compositor, so it is wrong on precisely the details people
 * comment about; it is offered, not relied on.
 */

export { captureElement, CaptureUnavailableError } from "./capture.js";
export type { CaptureOptions } from "./capture.js";

export { imageFrom, imageIn, MAXIMUM_BYTES, previewOf } from "./paste.js";
export type { PastedImage, Preview } from "./paste.js";
