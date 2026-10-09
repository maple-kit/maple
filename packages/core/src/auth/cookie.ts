/**
 * The reviewer's GitHub session, kept in a cookie on the preview's own origin.
 *
 * The value is a user-to-server token: one reviewer's, able to do only what the
 * App may do on the repositories it was installed on. It is `HttpOnly`, so no
 * page script can read it, and it never returns to the browser in a body.
 *
 * Encryption is optional and narrow. `HttpOnly` carries the weight, and
 * `docs/github-auth.md` is the reasoning for both.
 */

import type { IdentityRequest } from "../connectors/types.js";

/** A linked reviewer, as the cookie carries them. */
export interface GitHubSession {
  /** A user-to-server access token. Server-side only, always. */
  readonly token: string;
  /** The login it belongs to, read once at link time so `/me` costs no call. */
  readonly login?: string;
}

/** How the session cookie is written and read back. */
export interface SessionCookieOptions {
  /** Defaults to `maple_gh`. */
  readonly name?: string;
  /** Base64 of 32 bytes. Encrypts the value with AES-GCM when present. */
  readonly key?: string;
  /** Defaults to `/api/maple`, which is where the route reads it. */
  readonly path?: string;
  /** Defaults to seven days. */
  readonly maxAgeSeconds?: number;
  /** Set only for a test server on plain http. `Secure` otherwise, always. */
  readonly insecure?: boolean;
}

/** The cookie the reviewer's token lives in. */
export const SESSION_COOKIE = "maple_gh";

/** The cookie a device code lives in, for the minutes between start and finish. */
export const PENDING_COOKIE = "maple_gh_pending";

const WEEK_SECONDS = 604_800;
const DEFAULT_PATH = "/api/maple";
const IV_BYTES = 12;

/**
 * Reads one cookie out of a request's `cookie` header. HTTP/2 and HTTP/3 may
 * send cookies as several headers, which `Headers` joins with ", ", so a comma
 * separates pairs too; RFC 6265 keeps commas out of cookie values.
 */
export function readCookie(
  headers: Readonly<Record<string, string>>,
  name: string,
): string | undefined {
  const header = headers["cookie"];
  if (!header) return undefined;

  for (const pair of header.split(/[;,]/)) {
    const at = pair.indexOf("=");
    if (at === -1) continue;
    if (pair.slice(0, at).trim() === name) return decodeURIComponent(pair.slice(at + 1).trim());
  }
  return undefined;
}

/**
 * The reviewer's session, or null. This is what an application's store
 * resolver calls to decide whether it has a GitHub token to build a store on.
 */
export async function readGitHubSession(
  request: IdentityRequest,
  options: SessionCookieOptions = {},
): Promise<GitHubSession | null> {
  const raw = readCookie(request.headers, options.name ?? SESSION_COOKIE);
  if (raw === undefined) return null;
  return parse(await unseal(raw, options.key)) ?? null;
}

/** A session on its way into a cookie. */
export function sessionText(session: GitHubSession): string {
  return JSON.stringify(session);
}

/** Encodes a value for a cookie, encrypting it when a key was given. */
export async function seal(plain: string, key: string | undefined): Promise<string> {
  if (key === undefined) return `p.${toBase64Url(utf8(plain))}`;

  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await importKey(key),
    utf8(plain),
  );

  return `e.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(sealed))}`;
}

/**
 * Decodes a cookie value. Undefined for anything it cannot read — a value
 * sealed with a key this process does not have reads as "not linked", which
 * is what a reviewer whose deployment lost its key actually is.
 */
export async function unseal(value: string, key: string | undefined): Promise<string | undefined> {
  try {
    return await decode(value, key);
  } catch {
    return undefined;
  }
}

async function decode(value: string, key: string | undefined): Promise<string | undefined> {
  const [kind, ...rest] = value.split(".");
  if (kind === "p") return text(fromBase64Url(rest[0] ?? ""));
  if (kind !== "e" || key === undefined || rest.length !== 2) return undefined;

  const opened = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(rest[0]!) },
    await importKey(key),
    fromBase64Url(rest[1]!),
  );
  return text(new Uint8Array(opened));
}

/** Reads a decoded value back as a session, or undefined when it is not one. */
export function parse(plain: string | undefined): GitHubSession | undefined {
  if (plain === undefined) return undefined;
  const read: unknown = safeJson(plain);
  if (typeof read !== "object" || read === null) return undefined;

  const session = read as { token?: unknown; login?: unknown };
  if (typeof session.token !== "string" || session.token.length === 0) return undefined;
  const login = typeof session.login === "string" ? { login: session.login } : {};
  return { token: session.token, ...login };
}

function safeJson(plain: string): unknown {
  try {
    return JSON.parse(plain);
  } catch {
    return undefined;
  }
}

/** The `Set-Cookie` that stores a value, with every flag the design relies on. */
export function setCookie(
  name: string,
  value: string,
  options: SessionCookieOptions,
  maxAgeSeconds?: number,
): string {
  const age = maxAgeSeconds ?? options.maxAgeSeconds ?? WEEK_SECONDS;
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path ?? DEFAULT_PATH}`,
    `Max-Age=${String(age)}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(options.insecure === true ? [] : ["Secure"]),
  ].join("; ");
}

/** The `Set-Cookie` that removes one. */
export function clearCookie(name: string, options: SessionCookieOptions): string {
  return setCookie(name, "", options, 0);
}

async function importKey(key: string): Promise<CryptoKey> {
  const raw = fromBase64Url(key.replaceAll("+", "-").replaceAll("/", "_"));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** Over its own buffer, which is what `crypto.subtle` will accept. */
function utf8(value: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(value);
  const copy = new Uint8Array(new ArrayBuffer(encoded.length));
  copy.set(encoded);
  return copy;
}

function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return unpadded(btoa(binary).replaceAll("+", "-").replaceAll("/", "_"));
}

/** `split` rather than a trailing-`=` pattern, which backtracks on a long value. */
function unpadded(value: string): string {
  return value.split("=")[0] ?? "";
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = unpadded(value).replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));

  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
  return bytes;
}
