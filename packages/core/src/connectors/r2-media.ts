/**
 * A media connector that keeps screenshots in a Cloudflare R2 bucket, through
 * a Worker binding.
 *
 * The bucket is typed structurally, so this package depends on no Cloudflare
 * types and the same code runs against any object with these four methods.
 */

import type { MediaBlob, MediaRef } from "../types.js";
import type { MediaConnector } from "./types.js";

/** What {@link r2Media} needs from an R2 bucket binding. */
export interface R2BucketLike {
  put(
    key: string,
    value: Uint8Array,
    options?: { readonly httpMetadata?: { readonly contentType?: string } },
  ): Promise<unknown>;
  head(key: string): Promise<unknown>;
  get(key: string): Promise<{
    arrayBuffer(): Promise<ArrayBuffer>;
    readonly httpMetadata?: { readonly contentType?: string };
  } | null>;
  delete(key: string): Promise<void>;
}

/** Options for {@link r2Media}. */
export interface R2MediaOptions {
  /** The bucket binding, e.g. `env.SCREENSHOTS`. */
  readonly bucket: R2BucketLike;
  /** Prepended to every object key, so one bucket can serve many previews. */
  readonly prefix?: string;
  /**
   * The link `getUrl` returns for a key. Without it `getUrl` answers with a
   * `data:` URL, which the route serves itself and a pull request strips.
   */
  readonly url?: (key: string) => string;
  /** Connector name reported to Maple. Defaults to `"r2"`. */
  readonly name?: string;
}

/** A key is checked before it names an object, so a URL cannot reach another prefix. */
const SAFE_KEY = /^[A-Za-z0-9_-]+$/;

function assertKey(key: string): void {
  if (!SAFE_KEY.test(key)) throw new RangeError(`No blob is held under ${key}.`);
}

function missing(key: string): RangeError {
  return new RangeError(`No blob is held under ${key}.`);
}

/** Creates a media connector backed by an R2 bucket. Keys are 128 random bits. */
export function r2Media(options: R2MediaOptions): MediaConnector {
  const { bucket, url } = options;
  const name = options.name ?? "r2";
  const prefix = options.prefix ?? "";

  async function putBlob(blob: MediaBlob): Promise<MediaRef> {
    const key = `shot-${crypto.randomUUID().replaceAll("-", "")}`;
    await bucket.put(prefix + key, blob.data, { httpMetadata: { contentType: blob.contentType } });
    return { connector: name, key, contentType: blob.contentType };
  }

  async function getUrl(ref: MediaRef): Promise<string> {
    assertKey(ref.key);
    if (url !== undefined) {
      if ((await bucket.head(prefix + ref.key)) === null) throw missing(ref.key);
      return url(ref.key);
    }
    const held = await bucket.get(prefix + ref.key);
    if (held === null) throw missing(ref.key);
    const type = held.httpMetadata?.contentType ?? ref.contentType;
    return dataUrl(type, new Uint8Array(await held.arrayBuffer()));
  }

  async function remove(ref: MediaRef): Promise<void> {
    assertKey(ref.key);
    await bucket.delete(prefix + ref.key);
  }

  return { name, putBlob, getUrl, remove };
}

function dataUrl(type: string, data: Uint8Array): string {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return `data:${type};base64,${btoa(binary)}`;
}
