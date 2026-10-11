/**
 * The reviewer's GitHub session, kept in a cookie on the preview's own origin.
 *
 * The cookie is sealed: AES-GCM under a key derived from a secret the host
 * holds, so a reader of it learns nothing and a writer of it cannot make one
 * the route accepts. It carries a user-to-server token and the login, and it
 * expires inside the sealed payload as well as on the browser's clock.
 * Every reader goes through `openSealed`: a value that does not open is not a
 * session, and there is no plain format to fall back on.
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
  /**
   * Seals and opens the cookie: 32+ bytes, such as `openssl rand -base64 48`.
   * A list is `[current, ...previous]`; the first seals and all of them open.
   */
  readonly secret: string | readonly string[];
  /** Defaults to `maple_gh`. */
  readonly name?: string;
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

/** What a sealed value is for. Bound into the seal, so one cannot stand in for the other. */
export type SealPurpose = "session" | "pending";

const WEEK_SECONDS = 604_800;
const DEFAULT_PATH = "/api/maple";
const IV_BYTES = 12;
const MIN_SECRET_BYTES = 32;
const VERSION = "s1";
const SECOND = 1000;

/**
 * Throws a plain Error unless the secret is usable. Called when a route or an
 * identity connector is built, so a weak secret fails at startup rather than
 * as a cookie nobody can explain later.
 */
export function assertSecret(secret: unknown): asserts secret is string | readonly string[] {
  const list = secretList(secret);
  if (list.length === 0) throw new Error("Maple: the session secret is required");
  for (const one of list) {
    if (typeof one !== "string" || utf8(one).length < MIN_SECRET_BYTES) {
      throw new Error(
        `Maple: the session secret must be at least ${String(MIN_SECRET_BYTES)} bytes, ` +
          "for example `openssl rand -base64 48`",
      );
    }
  }
}

function secretList(secret: unknown): readonly unknown[] {
  if (Array.isArray(secret)) return secret as readonly unknown[];
  return secret === undefined ? [] : [secret];
}

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
    if (pair.slice(0, at).trim() === name) return safeDecodeURI(pair.slice(at + 1).trim());
  }
  return undefined;
}

function safeDecodeURI(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

/**
 * The reviewer's session, or null. This is what an application's store
 * resolver calls to decide whether it has a GitHub token to build a store on.
 * A missing, forged, tampered, expired or wrongly keyed cookie is null.
 */
export async function readGitHubSession(
  request: IdentityRequest,
  options: SessionCookieOptions,
): Promise<GitHubSession | null> {
  return openSession(request.headers, options);
}

/** Opens the session cookie in a header set. Null for anything that is not one. */
export async function openSession(
  headers: Readonly<Record<string, string>>,
  options: SessionCookieOptions,
): Promise<GitHubSession | null> {
  const raw = readCookie(headers, options.name ?? SESSION_COOKIE);
  if (raw === undefined) return null;
  return parseSession(await openSealed(raw, "session", options.secret));
}

/** A session, sealed for its cookie. */
export async function sealSession(
  session: GitHubSession,
  options: SessionCookieOptions,
): Promise<string> {
  const age = options.maxAgeSeconds ?? WEEK_SECONDS;
  return sealValue(JSON.stringify(session), "session", options.secret, age);
}

/**
 * Seals a value for `lifetimeSeconds`. The issue and expiry times are inside
 * the ciphertext, and so is the purpose, so none of them can be edited.
 */
export async function sealValue(
  plain: string,
  purpose: SealPurpose,
  secret: string | readonly string[],
  lifetimeSeconds: number,
): Promise<string> {
  assertSecret(secret);
  const issued = Date.now();
  const payload = JSON.stringify({ v: plain, iat: issued, exp: issued + lifetimeSeconds * SECOND });
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: utf8(`${VERSION}:${purpose}`) },
    await deriveKey(secretList(secret)[0] as string),
    utf8(payload),
  );
  return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(sealed))}`;
}

/**
 * The one opener. Undefined for anything it cannot open: the wrong format,
 * the wrong secret, a changed byte, another purpose, or a value past its
 * expiry. It never throws, because a bad cookie is a signed-out reviewer.
 */
export async function openSealed(
  value: string,
  purpose: SealPurpose,
  secret: string | readonly string[],
): Promise<string | undefined> {
  assertSecret(secret);
  const [version, iv, body, ...extra] = value.split(".");
  if (version !== VERSION || iv === undefined || body === undefined || extra.length > 0) {
    return undefined;
  }
  for (const one of secretList(secret) as readonly string[]) {
    const opened = await tryOpen(iv, body, purpose, one);
    if (opened !== undefined) return opened;
  }
  return undefined;
}

async function tryOpen(
  iv: string,
  body: string,
  purpose: SealPurpose,
  secret: string,
): Promise<string | undefined> {
  try {
    const opened = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64Url(iv), additionalData: utf8(`${VERSION}:${purpose}`) },
      await deriveKey(secret),
      fromBase64Url(body),
    );
    return unexpired(JSON.parse(text(new Uint8Array(opened))) as unknown);
  } catch {
    return undefined;
  }
}

function unexpired(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const { v, exp } = payload as { v?: unknown; exp?: unknown };
  if (typeof v !== "string" || typeof exp !== "number") return undefined;
  return Date.now() < exp ? v : undefined;
}

/** Reads a decoded value back as a session, or undefined when it is not one. */
export function parseSession(plain: string | undefined): GitHubSession | null {
  if (plain === undefined) return null;
  const read: unknown = safeJson(plain);
  if (typeof read !== "object" || read === null) return null;

  const session = read as { token?: unknown; login?: unknown };
  if (typeof session.token !== "string" || session.token.length === 0) return null;
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
  options: Partial<SessionCookieOptions>,
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
export function clearCookie(name: string, options: Partial<SessionCookieOptions>): string {
  return setCookie(name, "", options, 0);
}

/** HKDF-SHA256 over the secret's bytes, so any long string makes a full-strength AES key. */
async function deriveKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", utf8(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: utf8("maple-session"), info: utf8("maple-session-v1") },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
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
