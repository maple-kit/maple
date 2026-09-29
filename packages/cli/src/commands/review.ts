/**
 * `maple review`: the overlay on a running app, with nothing wired into it.
 *
 * Runs the app's dev script, or attaches to one already running, and opens a
 * proxy in front of it that adds the overlay and the SDK route. The app's code
 * and dependencies are untouched. `docs/review.md` is the design.
 */

import { isSet } from "../args.js";
import { startReview } from "../review/session.js";

import type { FlagSpec, ParsedArgs } from "../args.js";
import type { ReviewSession } from "../review/session.js";
import type { RunResult } from "../run.js";

/** The flags `maple review` accepts beyond the global ones. */
export const REVIEW_FLAGS = {
  port: "string",
  url: "string",
  script: "string",
  "proxy-port": "string",
  "no-open": "boolean",
} as const satisfies FlagSpec;

/** What `maple review` prints when its flags are wrong. */
export const REVIEW_USAGE = `Usage: maple review [--port <n> | --url <address>] [--script <name>] [--proxy-port <n>] [--no-open]

Puts the Maple overlay on your running app through a local proxy, with nothing
added to the app. Without --port or --url it runs the dev script first.

  --port <n>          Attach to the app already running on localhost:<n>
  --url <address>     Attach to the app at this address, such as http://localhost:3000
  --script <name>     The package.json script to run instead of "dev"
  --proxy-port <n>    Serve the proxy on this port instead of a free one
  --no-open           Print the address without opening a browser`;

/** What the command needs from its environment. */
export interface ReviewCommandOptions {
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  /** Replaces the overlay bundle, for a test that has none built. */
  readonly overlay?: string;
}

class ReviewArgsError extends Error {}

function port(flags: ParsedArgs["flags"], name: string): number | undefined {
  const value = flags[name];
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new ReviewArgsError(`--${name} must be a port number, not "${value}".`);
  }
  return parsed;
}

function attachTarget(flags: ParsedArgs["flags"]): URL | undefined {
  const address = flags["url"];
  const number = port(flags, "port");
  if (address !== undefined && number !== undefined) {
    throw new ReviewArgsError("Give --port or --url, not both.");
  }
  if (number !== undefined) return new URL(`http://localhost:${String(number)}`);
  if (typeof address !== "string") return undefined;

  try {
    const url = new URL(address);
    if (url.protocol === "http:" || url.protocol === "https:") return url;
  } catch {
    // Falls through to the error below.
  }
  throw new ReviewArgsError(`--url must be an http or https address, not "${address}".`);
}

function describe(session: ReviewSession): string {
  const kind = session.store.kind === "file" ? "the local file store" : "GitHub";
  return [
    "Maple review is running.",
    "",
    `  Open      ${session.url}`,
    `  Your app  ${session.target.origin}${session.started ? " (started from its dev script)" : ""}`,
    `  Comments  ${session.store.where} (${kind})`,
    `  Branch    ${session.store.branch}`,
    "",
    "Stop with Ctrl-C.",
  ].join("\n");
}

/** Starts the review and returns its address; the process stays up for as long as the proxy does. */
export async function review(
  args: ParsedArgs,
  options: ReviewCommandOptions = {},
): Promise<RunResult> {
  let session: ReviewSession;
  try {
    const target = attachTarget(args.flags);
    const proxyPort = port(args.flags, "proxy-port");
    const script = args.flags["script"];
    session = await startReview({
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      open: !isSet(args.flags, "no-open"),
      ...(target === undefined ? {} : { target }),
      ...(typeof script === "string" ? { script } : {}),
      ...(proxyPort === undefined ? {} : { proxyPort }),
      ...(options.overlay === undefined ? {} : { overlay: options.overlay }),
    });
  } catch (error) {
    if (error instanceof ReviewArgsError) {
      return { output: `maple review: ${error.message}\n\n${REVIEW_USAGE}`, exitCode: 1 };
    }
    return {
      output: `maple review: ${error instanceof Error ? error.message : String(error)}`,
      exitCode: 1,
    };
  }

  const output = isSet(args.flags, "json")
    ? JSON.stringify(
        {
          url: session.url,
          target: session.target.origin,
          store: session.store.kind,
          where: session.store.where,
          branch: session.store.branch,
        },
        null,
        2,
      )
    : describe(session);
  return { output, exitCode: 0, running: { stop: () => session.stop() } };
}
