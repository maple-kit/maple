/**
 * An installation token for Maple's own GitHub App.
 *
 * This is the other half of `device-flow.ts`. That one signs a reviewer in and
 * acts as them; this one acts as the App itself, which is the only way to
 * write a check run. `docs/github-auth.md` says why they are two Apps: a token
 * minted here can write checks, and no reviewer's cookie may ever reach it.
 */

import { USER_AGENT } from "../internal/user-agent.js";
import { toPkcs8 } from "../lib/pkcs8.js";

/** Where the App authenticates and as whom. */
export interface InstallationAuthOptions {
  /** The App's id, as GitHub's settings page shows it. */
  readonly appId: string;
  /** Which installation to mint for. An App may be installed many times. */
  readonly installationId: string;
  /**
   * The App's private key, PEM, in either shape GitHub has handed out. A
   * credential: read it from the environment, never from a file in the tree.
   */
  readonly privateKey: string;
  /** Defaults to `https://api.github.com`. Set this for Enterprise Server. */
  readonly baseUrl?: string;
  /** Injected in tests. Defaults to the global `fetch`. */
  readonly fetch?: typeof globalThis.fetch;
  /** Injected in tests, so expiry is asserted rather than waited for. */
  readonly now?: () => number;
}

/** Mints and remembers an installation token. Create one per process. */
export interface InstallationAuth {
  /** A token good right now, from the cache where one still is. */
  token(): Promise<string>;
}

/** Raised when GitHub will not mint a token, or the key cannot sign one. */
export class InstallationAuthError extends Error {
  override readonly name = "InstallationAuthError";
}

const DEFAULT_BASE = "https://api.github.com";
const SECOND = 1000;

/** GitHub refuses a JWT more than ten minutes out; nine leaves room for drift. */
const JWT_LIFETIME = 9 * 60 * SECOND;

/** Backdated, because GitHub rejects a JWT whose `iat` is in its own future. */
const JWT_BACKDATE = 60 * SECOND;

/**
 * How early a cached token is given up. An installation token lasts an hour,
 * and a request that starts valid must not finish expired.
 */
const EARLY = 5 * 60 * SECOND;

interface TokenResponse {
  readonly token?: string;
  readonly expires_at?: string;
  readonly message?: string;
}

interface Held {
  readonly token: string;
  /** Milliseconds since the epoch, already brought forward by {@link EARLY}. */
  readonly until: number;
}

/**
 * Creates the minter. Nothing is signed until the first call, so a deployment
 * with a broken key fails on the first gate publish rather than at startup —
 * which is the behaviour a gate wants: it must never cost a resolve.
 */
export function createInstallationAuth(options: InstallationAuthOptions): InstallationAuth {
  const clock = options.now ?? Date.now;
  let held: Held | undefined;
  let minting: Promise<Held> | undefined;
  let signing: Promise<CryptoKey> | undefined;

  const key = (): Promise<CryptoKey> => {
    signing ??= importKey(options.privateKey);
    return signing;
  };

  const fresh = async (): Promise<Held> => {
    const jwt = await sign(await key(), options.appId, clock());
    return await mint(options, jwt, clock());
  };

  return {
    async token(): Promise<string> {
      if (held && clock() < held.until) return held.token;

      // One mint at a time: a burst of resolves on one surface must not each
      // pay for a token, and a failure has to be re-askable rather than kept.
      minting ??= fresh().finally(() => {
        minting = undefined;
      });

      held = await minting;
      return held.token;
    },
  };
}

async function importKey(pem: string): Promise<CryptoKey> {
  const der = toPkcs8(pem);
  return await crypto.subtle.importKey(
    "pkcs8",
    der as unknown as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** An RS256 JWT, which is what `POST /app/installations/…` authenticates with. */
async function sign(key: CryptoKey, appId: string, at: number): Promise<string> {
  const seconds = Math.floor(at / SECOND);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iat: seconds - JWT_BACKDATE / SECOND,
    exp: seconds + JWT_LIFETIME / SECOND,
    iss: appId,
  };

  const signed = `${base64Url(json(header))}.${base64Url(json(claims))}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signed),
  );

  return `${signed}.${base64Url(new Uint8Array(signature))}`;
}

async function mint(options: InstallationAuthOptions, jwt: string, at: number): Promise<Held> {
  const base = options.baseUrl ?? DEFAULT_BASE;
  const call = options.fetch ?? globalThis.fetch;
  const path = `/app/installations/${encodeURIComponent(options.installationId)}/access_tokens`;

  const response = await call(`${base}${path}`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${jwt}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": USER_AGENT,
    },
  });

  const body = (await response.json().catch(() => undefined)) as TokenResponse | undefined;
  if (!response.ok || !body?.token) throw refused(response, body, path);

  return { token: body.token, until: expiry(body.expires_at, at) };
}

/**
 * GitHub's own message. A 401 here is a clock or a key, and a 404 is an App
 * that is registered and not installed — which are different fixes.
 */
function refused(
  response: Response,
  body: TokenResponse | undefined,
  path: string,
): InstallationAuthError {
  const detail = body?.message ?? response.statusText;
  return new InstallationAuthError(`GitHub ${String(response.status)} on ${path}: ${detail}`);
}

/** An hour is the documented life; a response that omits it gets the floor. */
function expiry(expiresAt: string | undefined, at: number): number {
  const parsed = expiresAt === undefined ? Number.NaN : Date.parse(expiresAt);
  const until = Number.isNaN(parsed) ? at + 60 * 60 * SECOND : parsed;

  return Math.max(at, until - EARLY);
}

function json(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

/** Base64url: JWT's alphabet, and no padding. */
function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
