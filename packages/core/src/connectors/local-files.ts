/**
 * The file handling the local connectors share: one JSON document or blob
 * written whole and atomically, and one lock per path within the process.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Writes to a temporary file beside the target and renames it over. A rename
 * within one directory is atomic, so a crash leaves the old file or the new
 * one and never half of either.
 */
export async function writeAtomic(path: string, data: Uint8Array | string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    await writeFile(temporary, data);
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

/** The file's text, or undefined where it does not exist. */
export async function readIfPresent(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

const tails = new Map<string, Promise<unknown>>();

/**
 * Runs `task` after every earlier task on the same path, so two read-modify-
 * write cycles in this process cannot lose each other's write. Another process
 * is not covered: `docs/connectors.md` says why that is #134's job.
 */
export function withLock<T>(path: string, task: () => Promise<T>): Promise<T> {
  const previous = tails.get(path) ?? Promise.resolve();
  const run = previous.then(task, task);
  const tail = run.catch(() => undefined);
  tails.set(path, tail);
  void tail.then(() => {
    if (tails.get(path) === tail) tails.delete(path);
  });
  return run;
}
