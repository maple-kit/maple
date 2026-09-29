import { createServer } from "node:http";

import type { IncomingHttpHeaders, Server } from "node:http";
import type { AddressInfo, Socket } from "node:net";

/** A page's own nonce and the policy that needs it, as Next's guide recommends. */
export const NONCE = "cGFnZS1ub25jZQ==";
export const STRICT_POLICY = `default-src 'self'; script-src 'nonce-${NONCE}' 'strict-dynamic'; connect-src https://api.example.test; img-src 'self'`;

/** Bytes that are not valid UTF-8, so a proxy that decodes text corrupts them. */
export const BINARY = Buffer.from([0xff, 0xfe, 0x00, 0x80, 0x0d, 0x0a, 0xc3]);

/** What the app under review saw arrive, most recent last. */
export interface Seen {
  readonly url: string;
  readonly headers: IncomingHttpHeaders;
}

/** A small app: a page under a strict policy, one without a policy, an asset, a redirect and an upgrade. */
export interface Upstream {
  readonly url: URL;
  readonly seen: Seen[];
  close(): Promise<void>;
}

const PAGE = `<!doctype html><html><head><title>Fixture</title></head><body><h1>Hello</h1><script nonce="${NONCE}">window.app = true</script></body></html>`;

function route(
  request: { url?: string | undefined },
  origin: string,
): [number, Record<string, string>, Buffer] {
  switch (request.url) {
    case "/": {
      return [
        200,
        { "content-type": "text/html; charset=utf-8", "content-security-policy": STRICT_POLICY },
        Buffer.from(PAGE),
      ];
    }
    case "/plain": {
      return [200, { "content-type": "text/html" }, Buffer.from("<html><body>plain</body></html>")];
    }
    case "/asset.bin": {
      return [200, { "content-type": "application/octet-stream" }, BINARY];
    }
    case "/redirect": {
      return [302, { location: `${origin}/plain` }, Buffer.alloc(0)];
    }
    default: {
      return [404, { "content-type": "text/plain" }, Buffer.from("nothing here")];
    }
  }
}

/** Starts the app on a free port. Its upgrades echo whatever bytes arrive, which is all a tunnel needs. */
export async function startUpstream(): Promise<Upstream> {
  const seen: Seen[] = [];
  const server: Server = createServer((request, response) => {
    seen.push({ url: request.url ?? "", headers: request.headers });
    const origin = `http://${request.headers.host ?? ""}`;
    const [status, headers, body] = route(request, origin);
    response.writeHead(status, headers);
    response.end(body);
  });
  server.on("upgrade", (request, socket) => {
    seen.push({ url: request.url ?? "", headers: request.headers });
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n",
    );
    socket.on("data", (chunk) => socket.write(chunk));
    socket.on("error", () => undefined);
  });
  const sockets = new Set<Socket>();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: new URL(`http://localhost:${String(port)}`),
    seen,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        for (const socket of sockets) socket.destroy();
      }),
  };
}
