/**
 * The solo bridge: a server on `127.0.0.1` in front of the file store and file
 * media, so a guest's overlay can write real comments to the machine that runs
 * their agent.
 *
 * It reuses the SDK route rather than restating its endpoints, and puts one
 * gate in front: a request is served only with the token, from the origin the
 * bridge was paired with, addressed to a loopback name. Everything else is
 * refused before the route sees it. `docs/solo.md` has the argument.
 */

import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

import { SOLO_HEADER, SOLO_PARAM, soloLink } from "../client/solo.js";
import { createMapleHandler, DEFAULT_BASE_PATH } from "../route/handler.js";
import { toNodeMiddleware } from "../route/node.js";
import { createCommentStore } from "../store.js";
import { fileMedia } from "./file-media.js";
import { fileStore } from "./file-store.js";

import type { Logger } from "../logger/types.js";
import type { LocalPlaceOptions } from "./local-place.js";
import type { IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/** What the bridge is started with. */
export interface BridgeOptions extends LocalPlaceOptions {
  /**
   * The preview's origin, such as `https://feat-x.preview.example`. The one
   * origin the bridge answers; a path or query is ignored.
   */
  readonly origin: string;
  /** Defaults to a free port. */
  readonly port?: number;
  /** Defaults to 32 random bytes. Only a test names one. */
  readonly token?: string;
  /** Where a failure in the route is reported. Silent when absent. */
  readonly logger?: Logger;
}

/** A running bridge. */
export interface Bridge {
  /** `http://127.0.0.1:<port>`. */
  readonly url: string;
  readonly token: string;
  /** The origin it answers, normalised. */
  readonly origin: string;
  /** The preview's address with the pairing as its fragment. */
  link(previewUrl: string): string;
  close(): Promise<void>;
}

/** Why a request was turned away. */
export interface Refusal {
  readonly status: 401 | 403;
  readonly reason: string;
}

/** What the gate needs to know about a request. */
export interface GateRequest {
  readonly method: string;
  /** Path and query, as sent. */
  readonly target: string;
  readonly headers: IncomingHttpHeaders;
}

/** What the gate holds a request against. */
export interface GateRules {
  readonly origin: string;
  readonly token: string;
  /** The `Host` values that name this bridge. */
  readonly hosts: ReadonlySet<string>;
}

/** The origin of an address, or a RangeError for one that cannot be paired. */
function originOf(address: string): string {
  const url = new URL(address);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new RangeError(`${address} is not an http or https address.`);
  }
  return url.origin;
}

function sameToken(given: string | undefined, wanted: string): boolean {
  if (given === undefined) return false;
  const [a, b] = [Buffer.from(given), Buffer.from(wanted)];
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The header's value, where an empty one is as good as none. */
function first(value: string | string[] | undefined): string | undefined {
  const one = Array.isArray(value) ? value[0] : value;
  return one === "" ? undefined : one;
}

/** A screenshot's `img` cannot send a header, so its token is in the query. */
function isMediaRead(method: string, path: string): boolean {
  return method === "GET" && path.startsWith(`${DEFAULT_BASE_PATH}/media/`);
}

/** The origin a request says it came from: `Origin`, or for an `img`, the referrer's. */
function claimedOrigin(request: GateRequest, allowReferrer: boolean): string | undefined {
  const origin = first(request.headers["origin"]);
  if (origin !== undefined || !allowReferrer) return origin;
  const referrer = first(request.headers["referer"]);
  try {
    return referrer === undefined ? undefined : new URL(referrer).origin;
  } catch {
    return undefined;
  }
}

/**
 * Judges a request. Undefined lets it through. Pure, so every refusal is a
 * row in a table.
 */
export function refusalFor(request: GateRequest, rules: GateRules): Refusal | undefined {
  const host = first(request.headers["host"]);
  if (host === undefined || !rules.hosts.has(host)) {
    return { status: 403, reason: "This is not the bridge's address." };
  }

  const url = new URL(request.target, "https://bridge.invalid");
  if (request.method === "OPTIONS") {
    // A preflight carries no token by design; the answer grants nothing.
    return first(request.headers["origin"]) === rules.origin
      ? undefined
      : { status: 403, reason: "This origin is not paired." };
  }

  const media = isMediaRead(request.method, url.pathname);
  const token =
    first(request.headers[SOLO_HEADER]) ??
    (media ? (url.searchParams.get(SOLO_PARAM) ?? undefined) : undefined);
  if (!sameToken(token, rules.token)) {
    return { status: 401, reason: "A pairing token is required." };
  }
  if (claimedOrigin(request, media) !== rules.origin) {
    return { status: 403, reason: "This origin is not paired." };
  }
  return undefined;
}

function refuse(response: ServerResponse, refusal: Refusal): void {
  response.statusCode = refusal.status;
  response.setHeader("content-type", "application/json");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify({ error: refusal.reason }));
}

/** CORS for the paired origin alone, and Chrome's private-network opt-in. */
function allowOrigin(response: ServerResponse, origin: string, request: IncomingMessage): void {
  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("vary", "Origin");
  if (request.method !== "OPTIONS") return;

  response.setHeader("access-control-allow-methods", "GET, POST, PATCH, DELETE");
  response.setHeader("access-control-allow-headers", `${SOLO_HEADER}, content-type, accept`);
  response.setHeader("access-control-max-age", "600");
  if (request.headers["access-control-request-private-network"] === "true") {
    response.setHeader("access-control-allow-private-network", "true");
  }
}

/** Starts the bridge. Resolves once it is listening on a loopback port. */
export async function startBridge(options: BridgeOptions): Promise<Bridge> {
  const origin = originOf(options.origin);
  const token = options.token ?? randomBytes(32).toString("base64url");
  const place = {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(options.root === undefined ? {} : { root: options.root }),
    ...(options.url === undefined ? {} : { url: options.url }),
  };
  const route = toNodeMiddleware(
    createMapleHandler({
      store: createCommentStore(fileStore(place)),
      media: fileMedia(place),
      ...(options.logger === undefined ? {} : { logger: options.logger }),
    }),
    DEFAULT_BASE_PATH,
  );

  const hosts = new Set<string>();
  const server = createServer((request, response) => {
    const refusal = refusalFor(
      { method: request.method ?? "GET", target: request.url ?? "/", headers: request.headers },
      { origin, token, hosts },
    );
    if (refusal) return refuse(response, refusal);

    allowOrigin(response, origin, request);
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      return response.end();
    }
    route(request, response, () => refuse(response, { status: 403, reason: "Not a Maple route." }));
  });

  const { port } = await listen(server, options.port ?? 0);
  hosts.add(`127.0.0.1:${String(port)}`).add(`localhost:${String(port)}`);
  const url = `http://127.0.0.1:${String(port)}`;

  return {
    url,
    token,
    origin,
    link: (previewUrl) => soloLink(previewUrl, { bridge: url, token }),
    close: () => shut(server),
  };
}

function listen(server: Server, port: number): Promise<AddressInfo> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server.address() as AddressInfo));
  });
}

function shut(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}
