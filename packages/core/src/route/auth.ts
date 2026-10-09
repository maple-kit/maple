/**
 * The three requests that link a reviewer's own GitHub account to a preview.
 *
 * Device Flow, because its exchange needs no client secret: a preview holds
 * the App's public client id and nothing else. The browser does the waiting —
 * a person takes minutes to type a code, and a request held open that long is
 * a request a proxy will close. `docs/github-auth.md` is the whole reasoning.
 */

import {
  clearCookie,
  parse,
  PENDING_COOKIE,
  readCookie,
  seal,
  SESSION_COOKIE,
  sessionText,
  setCookie,
  unseal,
} from "../auth/cookie.js";
import { createDeviceFlow, DeviceFlowError } from "../auth/device-flow.js";
import { USER_AGENT } from "../internal/user-agent.js";

import type { GitHubSession, SessionCookieOptions } from "../auth/cookie.js";
import type { DeviceCode, DeviceFlowFailure } from "../auth/device-flow.js";

/** How the route signs a reviewer in. Absent, it serves no auth endpoints. */
export interface GitHubAuthOptions extends SessionCookieOptions {
  /** The App's client id. Public: it is not a secret, and none is needed. */
  readonly clientId: string;
  /** Defaults to `https://github.com`. Set this for Enterprise Server. */
  readonly baseUrl?: string;
  /** Defaults to `https://api.github.com`. Read once, for the login. */
  readonly apiBaseUrl?: string;
  /** Injected in tests. Defaults to the global `fetch`. */
  readonly fetch?: typeof globalThis.fetch;
}

/** What a linked reviewer looks like from outside. Never the token. */
export interface GitHubState {
  readonly linked: boolean;
  readonly login?: string;
}

const DEFAULT_API = "https://api.github.com";
const SECOND = 1000;

/** `denied` and `expired` are the reviewer's; the other two are the App's. */
const LINK_FAILURE: Record<DeviceFlowFailure, number> = {
  denied: 403,
  expired: 410,
  unsupported: 501,
  unknown: 502,
};

/** Asks GitHub for a code, and keeps the device code out of the browser. */
export async function startLink(options: GitHubAuthOptions): Promise<Response> {
  const code = await flowFor(options).start();
  const pending = await seal(JSON.stringify(code), options.key);
  const lifetime = Math.max(1, Math.ceil((code.expiresAt - Date.now()) / SECOND));

  return json(
    {
      userCode: code.userCode,
      verificationUri: code.verificationUri,
      expiresAt: code.expiresAt,
      interval: code.interval,
    },
    200,
    setCookie(PENDING_COOKIE, pending, options, lifetime),
  );
}

/**
 * One exchange. `pending` is the flow working: the reviewer has not finished
 * typing the code yet, and the browser should ask again after `interval`.
 */
export async function finishLink(
  options: GitHubAuthOptions,
  headers: Readonly<Record<string, string>>,
): Promise<Response> {
  const code = await pendingCode(options, headers);
  if (!code) return json({ error: "No sign-in is in progress", reason: "expired" }, 410);

  const result = await flowFor(options).exchange(code);
  if (result.status === "pending") return json(result, 200);

  const session = await sessionFor(options, result.token.accessToken);
  const stored = await seal(sessionText(session), options.key);
  return json({ status: "linked", ...stateOf(session) }, 200, [
    setCookie(SESSION_COOKIE, stored, options),
    clearCookie(PENDING_COOKIE, options),
  ]);
}

/** Forgets the token. GitHub still holds the authorisation until revoked. */
export function endLink(options: GitHubAuthOptions): Response {
  return json({ status: "signed-out" }, 200, [
    clearCookie(SESSION_COOKIE, options),
    clearCookie(PENDING_COOKIE, options),
  ]);
}

/** Whether this reviewer has linked, for `/me`. Reads the cookie, calls nothing. */
export async function githubState(
  options: GitHubAuthOptions,
  headers: Readonly<Record<string, string>>,
): Promise<GitHubState> {
  const raw = readCookie(headers, options.name ?? SESSION_COOKIE);
  const session = raw === undefined ? undefined : parse(await unseal(raw, options.key));
  return session ? stateOf(session) : { linked: false };
}

/** Turns a device-flow failure into a status. The reason is what the overlay says. */
export function linkFailure(error: unknown): Response | undefined {
  if (!(error instanceof DeviceFlowError)) return undefined;

  const status = LINK_FAILURE[error.reason];

  return json({ error: error.message, reason: error.reason }, status, [
    clearCookie(PENDING_COOKIE, {}),
  ]);
}

function flowFor(options: GitHubAuthOptions) {
  return createDeviceFlow({
    clientId: options.clientId,
    ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
}

async function pendingCode(
  options: GitHubAuthOptions,
  headers: Readonly<Record<string, string>>,
): Promise<DeviceCode | undefined> {
  const raw = readCookie(headers, PENDING_COOKIE);
  if (raw === undefined) return undefined;

  const plain = await unseal(raw, options.key);
  const read: unknown = plain === undefined ? undefined : safeJson(plain);
  if (typeof read !== "object" || read === null) return undefined;

  const code = read as DeviceCode;
  return typeof code.deviceCode === "string" ? code : undefined;
}

/**
 * Read once so `/me` is a cookie read rather than a GitHub call per page load.
 * A failure is not fatal: a session without a login still writes comments.
 */
async function sessionFor(options: GitHubAuthOptions, token: string): Promise<GitHubSession> {
  const call = options.fetch ?? globalThis.fetch;
  try {
    const response = await call(`${options.apiBaseUrl ?? DEFAULT_API}/user`, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "user-agent": USER_AGENT,
      },
    });
    if (!response.ok) return { token };

    const body = (await response.json()) as { login?: unknown };
    return typeof body.login === "string" ? { token, login: body.login } : { token };
  } catch {
    return { token };
  }
}

function stateOf(session: GitHubSession): GitHubState {
  return { linked: true, ...(session.login === undefined ? {} : { login: session.login }) };
}

function safeJson(plain: string): unknown {
  try {
    return JSON.parse(plain);
  } catch {
    return undefined;
  }
}

function json(body: unknown, status: number, cookies?: string | string[]): Response {
  const headers = new Headers({
    "content-type": "application/json",
    "cache-control": "no-store",
  });
  for (const cookie of typeof cookies === "string" ? [cookies] : (cookies ?? [])) {
    headers.append("set-cookie", cookie);
  }
  return new Response(JSON.stringify(body), { status, headers });
}
