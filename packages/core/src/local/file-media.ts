/**
 * A media connector that keeps screenshots as image files in
 * `.maple/<branch>/media/<key>.<ext>`.
 *
 * Like {@link fileStore} it is for a laptop. `getUrl` answers with a data URL,
 * which the route serves rather than redirects to, so nothing has to host the
 * folder.
 */

import { randomUUID } from "node:crypto";
import { readdir, readFile, unlink } from "node:fs/promises";
import { join, parse } from "node:path";

import { writeAtomic } from "./local-files.js";
import { resolveLocalPlace } from "./local-place.js";

import type { MediaConnector } from "../connectors/types.js";
import type { MediaBlob, MediaRef } from "../types.js";
import type { LocalPlaceOptions } from "./local-place.js";

/** Options for {@link fileMedia}. */
export interface FileMediaOptions extends LocalPlaceOptions {
  /** Connector name reported to Maple, and kept on every ref. Defaults to `"file"`. */
  readonly name?: string;
}

const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

const TYPES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(EXTENSIONS).map(([type, extension]) => [extension, type]),
);

/** The route decodes a key out of a URL, so a key is checked before it names a path. */
const SAFE_KEY = /^[A-Za-z0-9_-]+$/;

function assertKey(key: string): void {
  if (!SAFE_KEY.test(key)) throw new RangeError(`No blob is held under ${key}.`);
}

/** Creates a media connector backed by image files under `.maple/`. */
export function fileMedia(options: FileMediaOptions = {}): MediaConnector {
  const name = options.name ?? "file";

  async function mediaDir(): Promise<string> {
    return join((await resolveLocalPlace(options)).dir, "media");
  }

  /** The file a key names, whatever extension it was given. */
  async function find(key: string): Promise<string | undefined> {
    assertKey(key);
    const dir = await mediaDir();
    const entries = await readdir(dir).catch(() => [] as string[]);
    const found = entries.find((entry) => parse(entry).name === key);
    return found === undefined ? undefined : join(dir, found);
  }

  async function putBlob(blob: MediaBlob): Promise<MediaRef> {
    const key = `shot-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const extension = EXTENSIONS[blob.contentType] ?? "bin";
    await writeAtomic(join(await mediaDir(), `${key}.${extension}`), blob.data);
    return { connector: name, key, contentType: blob.contentType };
  }

  async function getUrl(ref: MediaRef): Promise<string> {
    const path = await find(ref.key);
    if (path === undefined) throw new RangeError(`No blob is held under ${ref.key}.`);

    const type = TYPES[parse(path).ext.slice(1)] ?? ref.contentType;
    return `data:${type};base64,${(await readFile(path)).toString("base64")}`;
  }

  async function remove(ref: MediaRef): Promise<void> {
    const path = await find(ref.key);
    if (path !== undefined) await unlink(path);
  }

  return { name, putBlob, getUrl, remove };
}
