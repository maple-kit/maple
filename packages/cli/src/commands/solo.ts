/**
 * `maple solo <preview-url>`: starts the bridge and prints the link that pairs
 * a preview with it.
 *
 * The command returns once the bridge is listening, and the listening server
 * is what keeps the process alive: `bin.ts` sets an exit code and does not
 * call `process.exit`. Ctrl-C ends it. `docs/solo.md` says what it is for.
 */

import { startBridge } from "@maple-kit/core/local";

import type { FlagSpec, ParsedArgs } from "../args.js";
import type { Bridge, BridgeOptions } from "@maple-kit/core/local";

export const SOLO_FLAGS = { port: "string" } as const satisfies FlagSpec;

export const SOLO_USAGE = `Usage
  maple solo <preview-url> [--port <number>]

  Starts a bridge on 127.0.0.1 in front of .maple/<branch>/ and prints the link
  that pairs that preview with it. Open the link in the browser you review in.
  Leave this running while you review; Ctrl-C stops it.

  --port  The port to listen on. A free one by default.`;

/** What the command prints, and its exit code. */
export interface SoloResult {
  readonly output: string;
  readonly exitCode: number;
}

/** What `maple solo` needs from its environment. */
export interface SoloOptions {
  /** Where `.maple/` is resolved from. Defaults to the process's. */
  readonly cwd?: string;
  /** Starts the bridge. Defaults to core's. */
  readonly start?: (options: BridgeOptions) => Promise<Bridge>;
}

function failed(output: string): SoloResult {
  return { output, exitCode: 1 };
}

/** The port asked for, undefined for none, or NaN for one that is not a port. */
function portFrom(flags: ParsedArgs["flags"]): number | undefined {
  const value = flags["port"];
  if (typeof value !== "string") return undefined;
  const port = Number(value);
  return Number.isInteger(port) && port >= 0 && port <= 65_535 ? port : Number.NaN;
}

function render(bridge: Bridge, link: string, json: boolean): string {
  if (json) return JSON.stringify({ link, bridge: bridge.url, origin: bridge.origin }, null, 2);
  return [
    `Solo bridge listening on ${bridge.url}, paired with ${bridge.origin} only.`,
    "Open this link in the browser you review in:",
    "",
    `  ${link}`,
    "",
    "Comments and screenshots go to .maple/ on this machine. Ctrl-C stops the bridge.",
  ].join("\n");
}

/** Runs the command. The token is in the link and nowhere else. */
export async function solo(
  { positionals, flags }: ParsedArgs,
  options: SoloOptions = {},
): Promise<SoloResult> {
  const address = positionals[0];
  if (address === undefined) return failed(SOLO_USAGE);

  const port = portFrom(flags);
  if (Number.isNaN(port)) return failed(`--port must be a port number.\n\n${SOLO_USAGE}`);

  try {
    const bridge = await (options.start ?? startBridge)({
      origin: address,
      ...(port === undefined ? {} : { port }),
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    });
    return { output: render(bridge, bridge.link(address), flags["json"] === true), exitCode: 0 };
  } catch (error) {
    const said = error instanceof Error ? error.message : String(error);
    return failed(`Could not start the solo bridge: ${said}`);
  }
}
