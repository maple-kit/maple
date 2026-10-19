/**
 * What an id or key may contain before it names an object or a path, so a URL
 * cannot reach another prefix or climb out of a folder.
 */
export const SAFE_KEY = /^[A-Za-z0-9_-]+$/;

/** The longest id a route or connector looks up; ids Maple issues are 32 characters. */
export const MAX_KEY_LENGTH = 128;

/** True when `key` is safe to put in an object key or a file name. */
export function isSafeKey(key: string): boolean {
  return key.length <= MAX_KEY_LENGTH && SAFE_KEY.test(key);
}

/** A fresh id of 128 random bits, as 32 hex characters. */
export function randomId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}
