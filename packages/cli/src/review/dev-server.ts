/**
 * Starting the app's dev script and finding out where it is listening.
 *
 * There is no portable way to ask a dev server its port, so its own output is
 * read for the first local address it prints, which is what every one of them
 * does. Its output is still passed on to the terminal: the developer should
 * see their server's errors, not have a wrapper swallow them.
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";

import { detectPackageManager, scriptCommand } from "./package-manager.js";

/** A dev server this process started. */
export interface DevServer {
  /** The address it printed. */
  readonly url: URL;
  /** Stops it and whatever it started. */
  stop(): void;
}

/** What starting one takes. */
export interface DevServerOptions {
  readonly cwd: string;
  /** The `package.json` script to run. Defaults to `dev`. */
  readonly script?: string;
  /** Where its output goes. Defaults to this process's stderr. */
  readonly onOutput?: (text: string) => void;
  /** How long to wait for it to print an address, in milliseconds. */
  readonly timeoutMs?: number;
}

const ADDRESS = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0):\d+/i;

/** The first local address in a chunk of output, with `0.0.0.0` read as `localhost`. */
export function findAddress(output: string): URL | undefined {
  const match = ADDRESS.exec(stripVTControlCharacters(output));
  if (match === null) return undefined;
  return new URL(match[0].replace("0.0.0.0", "localhost"));
}

/** Whether `package.json` in `cwd` defines the script, so the failure can say what to do instead. */
function hasScript(cwd: string, script: string): boolean {
  try {
    const manifest = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as {
      scripts?: Record<string, unknown>;
    };
    return typeof manifest.scripts?.[script] === "string";
  } catch {
    return false;
  }
}

/** Runs `<manager> run <script>` in its own process group, resolving once it prints an address. */
export function startDevServer(options: DevServerOptions): Promise<DevServer> {
  const script = options.script ?? "dev";
  if (!hasScript(options.cwd, script)) {
    return Promise.reject(
      new Error(
        `${join(options.cwd, "package.json")} has no "${script}" script. ` +
          `Start the app yourself and pass --port or --url, or name the script with --script.`,
      ),
    );
  }

  const { command, args } = scriptCommand(detectPackageManager(options.cwd), script);
  const child = spawn(command, args, {
    cwd: options.cwd,
    detached: true,
    env: { ...process.env, BROWSER: "none", FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stop = (): void => {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, "SIGTERM");
    } catch {
      // Already gone, which is what stopping wanted.
    }
  };

  return new Promise((resolve, reject) => {
    let seen = "";
    let settled = false;
    const finish = (settle: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      settle();
    };
    const timer = setTimeout(() => {
      stop();
      finish(() =>
        reject(
          new Error(`\`${command} ${args.join(" ")}\` printed no local address. Pass --port.`),
        ),
      );
    }, options.timeoutMs ?? 90_000);

    const onData = (chunk: Buffer): void => {
      const text = chunk.toString("utf8");
      (options.onOutput ?? ((output) => process.stderr.write(output)))(text);
      seen = (seen + text).slice(-4096);
      const url = findAddress(seen);
      if (url !== undefined) finish(() => resolve({ url, stop }));
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (error) => finish(() => reject(error)));
    child.on("exit", (code) =>
      finish(() =>
        reject(new Error(`\`${command} ${args.join(" ")}\` exited with ${String(code)}.`)),
      ),
    );
  });
}
