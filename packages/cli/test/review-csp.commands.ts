/**
 * Node-side commands the Chromium test calls: an app under a strict policy, and
 * the review proxy in front of it. They import only the proxy itself, which
 * uses `node:` modules alone, so a browser run needs no build to have run first.
 */

import { createServer } from "node:http";

import { createProxyListener, createUpgradeListener } from "../src/review/proxy.js";

import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const NONCE = "Zml4dHVyZS1ub25jZQ==";

/** Nonce plus strict-dynamic, and a connect-src and img-src that name only other hosts. */
export const POLICY = `default-src 'none'; script-src 'nonce-${NONCE}' 'strict-dynamic'; connect-src https://api.example.test; img-src 'self'`;

/** The overlay stand-in: does what the real one needs of the page, and reports what worked. */
const OVERLAY = `(async () => {
  const seen = { overlay: true, ping: false, blob: false };
  try { seen.ping = (await fetch("/__maple/api/ping")).ok; } catch {}
  const gif = Uint8Array.from(atob("R0lGODlhAQABAAAAACwAAAAAAQABAAA="), (c) => c.charCodeAt(0));
  await new Promise((done) => {
    const image = new Image();
    image.onload = () => { seen.blob = true; done(); };
    image.onerror = done;
    image.src = URL.createObjectURL(new Blob([gif], { type: "image/gif" }));
  });
  await fetch("/__probe", { method: "POST", body: JSON.stringify(seen) });
})();`;

const PAGE = `<!doctype html><html><body><h1>App</h1><script nonce="${NONCE}">fetch("/__probe", { method: "POST", body: JSON.stringify({ app: true }) });</script></body></html>`;

/** What a running fixture is made of. */
interface Fixture {
  readonly servers: Server[];
  probe: Record<string, boolean>;
}

let running: Fixture | undefined;

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

/** Starts both servers and says where to point a browser, and what each policy header was. */
export async function startCspFixture(): Promise<{
  proxyUrl: string;
  direct: string | null;
  proxied: string | null;
}> {
  const fixture: Fixture = { servers: [], probe: {} };
  const app = createServer((request, response) => {
    if (request.url === "/__probe") {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        Object.assign(fixture.probe, JSON.parse(Buffer.concat(chunks).toString("utf8")));
        response.end("ok");
      });
      return;
    }
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": POLICY,
    });
    response.end(PAGE);
  });
  const target = new URL(`http://localhost:${String(await listen(app))}`);

  const settings = {
    target,
    overlay: OVERLAY,
    route: (_request: unknown, response: { end(body: string): void }) => response.end("{}"),
    tag: { branch: "feat/x", basePath: "/__maple/api", root: "/work", appDir: "" },
  };
  const proxy = createServer(createProxyListener(settings as never));
  proxy.on("upgrade", createUpgradeListener(settings as never));
  const proxyUrl = `http://localhost:${String(await listen(proxy))}/`;

  fixture.servers.push(app, proxy);
  running = fixture;
  return {
    proxyUrl,
    direct: (await fetch(target)).headers.get("content-security-policy"),
    proxied: (await fetch(proxyUrl)).headers.get("content-security-policy"),
  };
}

/** What the page and the overlay reported back, once they have. */
export function readProbe(): Record<string, boolean> {
  return { ...running?.probe };
}

export function stopCspFixture(): void {
  for (const server of running?.servers ?? []) {
    server.close();
    server.closeAllConnections();
  }
  running = undefined;
}
