/**
 * Starting the solo bridge from inside the MCP server.
 *
 * The server outlives a tool call, so the bridge it starts does too, and is
 * ended with the server. One bridge serves one preview origin: asking again
 * for the same origin returns the same link rather than a second token.
 */

import { startBridge } from "@maple-kit/core/local";

import type { Bridge, BridgeOptions } from "@maple-kit/core/local";

/** What starting solo mode hands back to the agent. */
export interface SoloLink {
  /** Open this in the browser the review happens in. */
  readonly link: string;
  /** The bridge's own address, for the agent's information. */
  readonly bridge: string;
}

/** Starts, or returns, the bridge for a preview. */
export type SoloStarter = (previewUrl: string) => Promise<SoloLink>;

/** What the starter is built from. */
export interface SoloStarterOptions {
  /** Where `.maple/` is resolved from. Defaults to the process's. */
  readonly cwd?: string;
  /** Injected in tests. Defaults to core's. */
  readonly start?: (options: BridgeOptions) => Promise<Bridge>;
}

/** A starter that keeps its bridges, one per origin, until the process ends. */
export function createSoloStarter(options: SoloStarterOptions = {}): SoloStarter {
  const start = options.start ?? startBridge;
  const running = new Map<string, Promise<Bridge>>();

  return async (previewUrl) => {
    const origin = new URL(previewUrl).origin;
    let bridge = running.get(origin);
    if (bridge === undefined) {
      bridge = start({ origin, ...(options.cwd === undefined ? {} : { cwd: options.cwd }) });
      running.set(origin, bridge);
      bridge.catch(() => running.delete(origin));
    }
    const started = await bridge;
    return { link: started.link(previewUrl), bridge: started.url };
  };
}
