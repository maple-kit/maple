/**
 * Taking a screenshot the reviewer already has.
 *
 * This is the first-class path, not a fallback. Client-side capture fails
 * hardest on exactly the details people comment about — a blurred font, a
 * hairline that renders differently, a cross-origin image — so the way to
 * attach a real screenshot ships on day one rather than after the complaints.
 */

/** An image a reviewer pasted or dropped. */
export interface PastedImage {
  readonly blob: Blob;
  readonly type: string;
  /** Present when the image came from a file rather than the clipboard. */
  readonly name?: string;
}

/** A preview URL and the way to release it. */
export interface Preview {
  /** A `blob:` URL. This is the one CSP directive Maple asks for: `img-src blob:`. */
  readonly url: string;
  /** Call when the preview is gone, or the blob is held for the page's lifetime. */
  revoke(): void;
}

const IMAGE = /^image\//;

/** The largest image worth attaching, before anyone waits on an upload. */
export const MAXIMUM_BYTES = 10 * 1024 * 1024;

/** Pulls an image out of a paste or a drop, or returns nothing when there is none. */
export function imageFrom(transfer: DataTransfer | null | undefined): PastedImage | undefined {
  for (const item of transfer?.items ?? []) {
    if (item.kind !== "file" || !IMAGE.test(item.type)) continue;

    const file = item.getAsFile();
    if (file && file.size > 0 && file.size <= MAXIMUM_BYTES) return described(file);
  }
  return undefined;
}

/** Pulls an image out of a list of files, for an `<input type="file">`. */
export function imageIn(
  files: FileList | readonly File[] | null | undefined,
): PastedImage | undefined {
  for (const file of files ?? []) {
    if (IMAGE.test(file.type) && file.size > 0 && file.size <= MAXIMUM_BYTES)
      return described(file);
  }
  return undefined;
}

/**
 * A URL for showing the image before it is uploaded.
 *
 * A `data:` URL would avoid the CSP directive and is the wrong trade: GitHub
 * strips `data:` images from a pull-request body, so the same URL cannot be
 * reused when the comment is exported.
 */
export function previewOf(image: PastedImage): Preview {
  const url = URL.createObjectURL(image.blob);
  return { url, revoke: () => URL.revokeObjectURL(url) };
}

function described(file: File): PastedImage {
  return { blob: file, type: file.type, ...(file.name ? { name: file.name } : {}) };
}
