/**
 * The reverse proxy `maple review` puts in front of an app.
 *
 * It owns three paths, the overlay script, the SDK route and nothing else, and
 * forwards every other request to the app unchanged, so the app gains no route
 * and no dependency. HTML gets the overlay's tag and a relaxed copy of its
 * policy; anything else streams through untouched, and a WebSocket upgrade
 * becomes a plain TCP tunnel, which is what keeps HMR working.
 */

import { randomBytes } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { connect as netConnect } from "node:net";
import { connect as tlsConnect } from "node:tls";

import { relaxHeader } from "./csp.js";
import { injectOverlay, relaxMeta } from "./inject.js";

import type { OverlayTag } from "./inject.js";
import type { NodeMiddleware } from "@maple-kit/core/route";
import type {
  IncomingHttpHeaders,
  IncomingMessage,
  OutgoingHttpHeaders,
  ServerResponse,
} from "node:http";
import type { Socket } from "node:net";

/** Where the proxy serves the overlay script from. Under `/__maple/`, which no app is likely to use. */
export const OVERLAY_PATH = "/__maple/overlay.js";

/** Where the proxy mounts the SDK route. */
export const ROUTE_PATH = "/__maple/api";

/** What the proxy is built from. */
export interface ProxyOptions {
  /** The app being reviewed. */
  readonly target: URL;
  /** The overlay's script text, served at {@link OVERLAY_PATH}. */
  readonly overlay: string;
  /** The SDK route, mounted at {@link ROUTE_PATH}. */
  readonly route: NodeMiddleware;
  /** What the injected tag says, apart from the nonce, which the page's policy decides. */
  readonly tag: Omit<OverlayTag, "nonce" | "src">;
  /** Told what was relaxed, once per page. */
  readonly onRelaxed?: (directives: readonly string[]) => void;
}

const HOP_BY_HOP = ["connection", "keep-alive", "transfer-encoding", "upgrade"] as const;

function freshNonce(): string {
  return randomBytes(16).toString("base64");
}

function isDocument(headers: IncomingHttpHeaders): boolean {
  return headers["sec-fetch-dest"] === "document" || (headers.accept ?? "").includes("text/html");
}

/** The request as the app should see it: addressed to itself, and readable without decoding. */
function requestHeaders(
  request: IncomingMessage,
  target: URL,
  proxyOrigin: string,
): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = { ...request.headers, host: target.host };
  headers["accept-encoding"] = "identity";
  for (const name of ["origin", "referer"] as const) {
    const value = headers[name];
    if (typeof value === "string") headers[name] = value.replace(proxyOrigin, target.origin);
  }
  if (isDocument(request.headers)) {
    delete headers["if-none-match"];
    delete headers["if-modified-since"];
  }
  return headers;
}

/** A redirect back to the app's own address is a redirect to the proxy. */
function responseHeaders(
  upstream: IncomingMessage,
  target: URL,
  proxyOrigin: string,
): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = { ...upstream.headers };
  if (typeof headers.location === "string" && headers.location.startsWith(target.origin)) {
    headers.location = headers.location.replace(target.origin, proxyOrigin);
  }
  return headers;
}

function isHtml(upstream: IncomingMessage, method: string | undefined): boolean {
  const { headers, statusCode = 200 } = upstream;
  const encoding = headers["content-encoding"];
  return (
    method !== "HEAD" &&
    statusCode !== 204 &&
    statusCode !== 304 &&
    /^text\/html/i.test(headers["content-type"] ?? "") &&
    (encoding === undefined || encoding === "identity")
  );
}

function readAll(stream: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

/** A page with the overlay in it, and the policy its response header carries relaxed to match. */
async function serveHtml(
  upstream: IncomingMessage,
  response: ServerResponse,
  headers: OutgoingHttpHeaders,
  options: ProxyOptions,
): Promise<void> {
  const policy = headers["content-security-policy"];
  const fromHeader = typeof policy === "string" ? relaxHeader(policy, freshNonce) : undefined;
  if (fromHeader !== undefined) headers["content-security-policy"] = fromHeader.header;

  const fromMeta = relaxMeta(
    (await readAll(upstream)).toString("utf8"),
    () => fromHeader?.nonce ?? freshNonce(),
  );
  const nonce = fromHeader?.nonce ?? fromMeta.nonce;
  const { html } = injectOverlay(fromMeta.html, {
    ...options.tag,
    src: OVERLAY_PATH,
    ...(nonce === undefined ? {} : { nonce }),
  });

  const body = Buffer.from(html, "utf8");
  for (const name of [...HOP_BY_HOP, "etag", "last-modified"]) delete headers[name];
  headers["content-length"] = body.byteLength;
  headers["cache-control"] = "no-store";
  response.writeHead(upstream.statusCode ?? 200, headers);
  response.end(body);

  const changed = [...(fromHeader?.changed ?? []), ...fromMeta.changed];
  if (changed.length > 0) options.onRelaxed?.([...new Set(changed)]);
}

function forward(request: IncomingMessage, response: ServerResponse, options: ProxyOptions): void {
  const { target } = options;
  const proxyOrigin = `http://${request.headers.host ?? "localhost"}`;
  const send = target.protocol === "https:" ? httpsRequest : httpRequest;

  const outgoing = send(
    {
      host: target.hostname,
      port: target.port,
      path: request.url,
      method: request.method,
      headers: requestHeaders(request, target, proxyOrigin),
    },
    (upstream) => {
      const headers = responseHeaders(upstream, target, proxyOrigin);
      if (isHtml(upstream, request.method)) {
        serveHtml(upstream, response, headers, options).catch(() => response.destroy());
        return;
      }
      response.writeHead(upstream.statusCode ?? 502, headers);
      upstream.pipe(response);
    },
  );
  outgoing.on("error", (error) => {
    if (response.headersSent) return response.destroy();
    response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    response.end(`Maple review could not reach ${target.origin}: ${error.message}\n`);
  });
  request.pipe(outgoing);
}

function serveOverlay(response: ServerResponse, overlay: string): void {
  response.writeHead(200, {
    "content-type": "text/javascript; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(overlay);
}

/**
 * Tunnels an upgrade to the app: the request is replayed with its host
 * rewritten, then bytes flow both ways untouched. The proxy never reads a frame.
 */
function tunnel(request: IncomingMessage, client: Socket, head: Buffer, target: URL): void {
  const port = Number(target.port || (target.protocol === "https:" ? 443 : 80));
  const upstream =
    target.protocol === "https:"
      ? tlsConnect({ host: target.hostname, port, servername: target.hostname })
      : netConnect({ host: target.hostname, port });
  const proxyOrigin = `http://${request.headers.host ?? "localhost"}`;

  const lines = [`${request.method ?? "GET"} ${request.url ?? "/"} HTTP/1.1`];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    const name = request.rawHeaders[index] ?? "";
    const value = request.rawHeaders[index + 1] ?? "";
    const lower = name.toLowerCase();
    if (lower === "host") lines.push(`${name}: ${target.host}`);
    else if (lower === "origin")
      lines.push(`${name}: ${value.replace(proxyOrigin, target.origin)}`);
    else lines.push(`${name}: ${value}`);
  }

  const start = (): void => {
    upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (head.length > 0) upstream.write(head);
    client.pipe(upstream).pipe(client);
  };
  upstream.once(target.protocol === "https:" ? "secureConnect" : "connect", start);
  upstream.on("error", () => client.destroy());
  client.on("error", () => upstream.destroy());
  client.on("close", () => upstream.destroy());
}

/** Builds the request listener, so a test can mount it on a server of its own. */
export function createProxyListener(
  options: ProxyOptions,
): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    const path = (request.url ?? "/").split("?")[0] ?? "/";
    if (path === OVERLAY_PATH) return serveOverlay(response, options.overlay);
    if (path.startsWith(ROUTE_PATH))
      return options.route(request, response, () => forward(request, response, options));
    forward(request, response, options);
  };
}

/** The upgrade listener: a tunnel to the app for every WebSocket. */
export function createUpgradeListener(
  options: ProxyOptions,
): (request: IncomingMessage, socket: Socket, head: Buffer) => void {
  return (request, socket, head) => tunnel(request, socket, head, options.target);
}
