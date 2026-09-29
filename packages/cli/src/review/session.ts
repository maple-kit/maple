/**
 * One `maple review`: the app, the proxy in front of it, and the store behind it.
 *
 * Kept apart from the command so a test can start one over a fixture app with
 * an overlay of its own and stop it again, which a command that returns text
 * has no way to do.
 */

import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import { createMapleHandler, toNodeMiddleware } from "@maple-kit/core/route";

import { startDevServer } from "./dev-server.js";
import { createProxyListener, createUpgradeListener, ROUTE_PATH } from "./proxy.js";
import { reviewStore } from "./store.js";

import type { ReviewStore } from "./store.js";
import type { Socket } from "node:net";

const exec = promisify(execFile);

/** What a review is started with. */
export interface ReviewOptions {
  /** Where the app's `package.json` is, and where `.maple/` is worked out from. */
  readonly cwd: string;
  /** The environment the store is read from. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** An app already running here, instead of starting its dev script. */
  readonly target?: URL;
  /** The `package.json` script to run. Defaults to `dev`. */
  readonly script?: string;
  /** The proxy's port. Defaults to one the system picks. */
  readonly proxyPort?: number;
  /** Open the proxy in the default browser. */
  readonly open?: boolean;
  /** The overlay script's text, in place of the bundle `@maple-kit/ui` ships. */
  readonly overlay?: string;
  /** A store, in place of the one the environment names. */
  readonly store?: ReviewStore;
  /** Where the dev script's own output goes. */
  readonly onOutput?: (text: string) => void;
  /** Told when a page's policy was relaxed, and which directives. */
  readonly onRelaxed?: (directives: readonly string[]) => void;
}

/** A review that is running. */
export interface ReviewSession {
  /** The address to open, on the proxy. */
  readonly url: string;
  /** The app behind it. */
  readonly target: URL;
  readonly store: ReviewStore;
  /** True when this process started the dev server, and so stops it. */
  readonly started: boolean;
  /** Stops the proxy and, when it started one, the dev server. */
  stop(): Promise<void>;
}

/** The overlay script `@maple-kit/ui` builds, read from wherever it is installed. */
async function shippedOverlay(): Promise<string> {
  const manifest = createRequire(import.meta.url).resolve("@maple-kit/ui/package.json");
  const file = join(dirname(manifest), "dist", "standalone.iife.js");
  try {
    return await readFile(file, "utf8");
  } catch {
    throw new Error(
      `The overlay bundle is missing at ${file}. Build it: pnpm --filter @maple-kit/ui build.`,
    );
  }
}

/** The top of the checkout `cwd` is in, which source paths are made relative to. */
async function repositoryRoot(cwd: string): Promise<string> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--show-toplevel"], { cwd });
    return stdout.trim() || cwd;
  } catch {
    return cwd;
  }
}

/** Opens `url` in the default browser. Failing to is not worth stopping for. */
function openInBrowser(url: string): void {
  let command = ["xdg-open", url];
  if (process.platform === "darwin") command = ["open", url];
  if (process.platform === "win32") command = ["cmd", "/c", "start", "", url];
  const [program = "open", ...args] = command;
  const child = spawn(program, args, { detached: true, stdio: "ignore" });
  child.on("error", () => undefined);
  child.unref();
}

function listen(server: ReturnType<typeof createServer>, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address !== null ? address.port : port);
    });
  });
}

/** Starts the app if it is not running, then the proxy in front of it. */
export async function startReview(options: ReviewOptions): Promise<ReviewSession> {
  const dev =
    options.target === undefined
      ? await startDevServer({
          cwd: options.cwd,
          ...(options.script === undefined ? {} : { script: options.script }),
          ...(options.onOutput === undefined ? {} : { onOutput: options.onOutput }),
        })
      : undefined;
  const target = options.target ?? dev!.url;

  try {
    const store = options.store ?? (await reviewStore(options.env, options.cwd, target.href));
    const overlay = options.overlay ?? (await shippedOverlay());
    const handler = createMapleHandler({
      store: store.store,
      ...(store.media === undefined ? {} : { media: store.media }),
      basePath: ROUTE_PATH,
    });

    const settings = {
      target,
      overlay,
      route: toNodeMiddleware(handler, ROUTE_PATH),
      tag: { branch: store.branch, basePath: ROUTE_PATH, root: await repositoryRoot(options.cwd) },
      ...(options.onRelaxed === undefined ? {} : { onRelaxed: options.onRelaxed }),
    };
    const server = createServer(createProxyListener(settings));
    server.on("upgrade", createUpgradeListener(settings));
    // An upgraded socket leaves the server's own bookkeeping, so it is kept here to be ended.
    const sockets = new Set<Socket>();
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });
    const port = await listen(server, options.proxyPort ?? 0);

    const url = `http://localhost:${String(port)}/`;
    if (options.open === true) openInBrowser(url);
    return {
      url,
      target,
      store,
      started: dev !== undefined,
      stop: () =>
        new Promise((resolve) => {
          dev?.stop();
          server.close(() => resolve());
          for (const socket of sockets) socket.destroy();
        }),
    };
  } catch (error) {
    dev?.stop();
    throw error;
  }
}
