/**
 * GitHub Device Flow, so a reviewer can sign in from a preview host.
 *
 * A preview URL differs on every deployment, so there is no stable callback to
 * register and the ordinary redirect flow is painful. Device Flow needs none.
 *
 * This runs on the SDK route, never in the overlay: a device code is a
 * credential for the few minutes it lives.
 */

/** Where the flow runs and as whom. */
export interface DeviceFlowOptions {
  /** The GitHub App's client id. Public; it is not a secret. */
  readonly clientId: string;
  /** Space-separated scopes. A GitHub App usually needs none. */
  readonly scope?: string;
  /** Defaults to `https://github.com`. Set this for Enterprise Server. */
  readonly baseUrl?: string;
  /** Injected in tests. Defaults to the global `fetch`. */
  readonly fetch?: typeof globalThis.fetch;
  /** Injected in tests, so polling does not really wait. */
  readonly sleep?: (ms: number) => Promise<void>;
}

/** What the reviewer is shown, and what the server keeps to itself. */
export interface DeviceCode {
  /** Shown to the reviewer. Short, and meant to be read aloud or typed. */
  readonly userCode: string;
  /** Where the reviewer types it. */
  readonly verificationUri: string;
  /** Milliseconds since the epoch. */
  readonly expiresAt: number;
  /** Seconds GitHub asks to be left between polls. */
  readonly interval: number;
  /** Server-side only. Never render or log this. */
  readonly deviceCode: string;
}

/** A user-to-server token. Also server-side only. */
export interface DeviceToken {
  readonly accessToken: string;
  readonly scope: string;
  /** Milliseconds since the epoch, when the token expires at all. */
  readonly expiresAt?: number;
  readonly refreshToken?: string;
}

/** Why a device flow ended without a token. */
export type DeviceFlowFailure = "denied" | "expired" | "unsupported" | "unknown";

/** Raised when the flow cannot produce a token. */
export class DeviceFlowError extends Error {
  override readonly name = "DeviceFlowError";

  constructor(
    readonly reason: DeviceFlowFailure,
    message: string,
  ) {
    super(message);
  }
}

/** The two halves of the flow. */
export interface DeviceFlow {
  /** Asks GitHub for a code to show the reviewer. */
  start(): Promise<DeviceCode>;
  /** Waits for the reviewer to finish, or throws saying why they did not. */
  poll(code: DeviceCode, signal?: AbortSignal): Promise<DeviceToken>;
}

interface CodeResponse {
  readonly device_code: string;
  readonly user_code: string;
  readonly verification_uri: string;
  readonly expires_in: number;
  readonly interval: number;
}

interface TokenResponse {
  readonly access_token?: string;
  readonly scope?: string;
  readonly expires_in?: number;
  readonly refresh_token?: string;
  readonly error?: string;
  readonly error_description?: string;
  readonly interval?: number;
}

const DEFAULT_BASE = "https://github.com";
const GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const SECOND = 1000;

/** Creates a device flow against one GitHub App. */
export function createDeviceFlow(options: DeviceFlowOptions): DeviceFlow {
  const base = options.baseUrl ?? DEFAULT_BASE;
  const call = options.fetch ?? globalThis.fetch;
  const wait = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  async function post<T>(path: string, body: Record<string, string>): Promise<T> {
    const response = await call(`${base}${path}`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new DeviceFlowError("unknown", `GitHub ${String(response.status)} on ${path}.`);
    }
    return (await response.json()) as T;
  }

  return {
    async start(): Promise<DeviceCode> {
      const body = await post<CodeResponse>("/login/device/code", {
        client_id: options.clientId,
        ...(options.scope === undefined ? {} : { scope: options.scope }),
      });

      return {
        userCode: body.user_code,
        verificationUri: body.verification_uri,
        expiresAt: Date.now() + body.expires_in * SECOND,
        interval: body.interval,
        deviceCode: body.device_code,
      };
    },

    async poll(code: DeviceCode, signal?: AbortSignal): Promise<DeviceToken> {
      let interval = code.interval;

      for (;;) {
        signal?.throwIfAborted();
        if (Date.now() >= code.expiresAt) {
          throw new DeviceFlowError("expired", "The code expired before it was entered.");
        }

        await wait(interval * SECOND);
        const body = await post<TokenResponse>("/login/oauth/access_token", {
          client_id: options.clientId,
          device_code: code.deviceCode,
          grant_type: GRANT,
        });

        const token = tokenIn(body);
        if (token) return token;
        interval = nextInterval(body, interval);
      }
    },
  };
}

function tokenIn(body: TokenResponse): DeviceToken | undefined {
  if (!body.access_token) {
    reject(body);
    return undefined;
  }

  return {
    accessToken: body.access_token,
    scope: body.scope ?? "",
    ...(body.expires_in === undefined ? {} : { expiresAt: Date.now() + body.expires_in * SECOND }),
    ...(body.refresh_token === undefined ? {} : { refreshToken: body.refresh_token }),
  };
}

/**
 * `authorization_pending` and `slow_down` are the flow working. Everything
 * else ends it, and the reason is what the interface has to say to the person.
 */
function reject(body: TokenResponse): void {
  const error = body.error ?? "unknown";
  if (error === "authorization_pending" || error === "slow_down") return;

  const message = body.error_description ?? error;
  if (error === "expired_token") throw new DeviceFlowError("expired", message);
  if (error === "access_denied") throw new DeviceFlowError("denied", message);
  if (error === "device_flow_disabled") throw new DeviceFlowError("unsupported", message);
  throw new DeviceFlowError("unknown", message);
}

/** GitHub asks for five more seconds on `slow_down`, and sends the new value. */
function nextInterval(body: TokenResponse, current: number): number {
  if (body.error !== "slow_down") return current;
  return body.interval ?? current + 5;
}
