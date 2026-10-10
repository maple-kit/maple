/**
 * The gate App's credentials, as the Worker's bindings carry them.
 *
 * A resolve on the preview then publishes `maple/visual-review` itself, so the
 * check clears with no workflow running. `docs/gate.md` has why that is a
 * second App; `docs/configuration.md` has the names.
 */

import { createInstallationAuth } from "@maple-kit/core/auth";
import { githubGate } from "@maple-kit/core/connectors";

import type { GateConnector } from "@maple-kit/core/connectors";
import type { Logger } from "@maple-kit/core/logger";
import type { GateResolver } from "@maple-kit/core/route";

/** The bindings the gate reads. The first three are absent unless the deploy was given the App. */
export interface GateEnv {
  readonly MAPLE_GATE_APP_ID?: string | undefined;
  readonly MAPLE_GATE_INSTALLATION_ID?: string | undefined;
  /** A secret: the App's `.pem`, contents rather than a path. */
  readonly MAPLE_GATE_PRIVATE_KEY?: string | undefined;
  /** `owner/name` of the repository whose pull request holds the comments. */
  readonly MAPLE_REPO: string;
}

/**
 * The route's gate, or undefined when any binding is missing, so the example
 * runs as it did before the App existed. Resolved per request because an
 * installation token lasts an hour and the isolate may outlive it; the
 * minter caches, so most requests mint nothing. A mint that fails answers null
 * and is logged: the route asks for the gate outside the guard around the
 * publish, and a resolve must never fail because the check could not move.
 */
export function gateFrom(env: GateEnv, logger?: Logger): GateResolver | undefined {
  const { MAPLE_GATE_APP_ID: appId, MAPLE_GATE_INSTALLATION_ID: installationId } = env;
  const privateKey = env.MAPLE_GATE_PRIVATE_KEY;
  if (!appId || !installationId || !privateKey) return undefined;

  const [owner = "", repo = ""] = env.MAPLE_REPO.split("/");
  const auth = createInstallationAuth({ appId, installationId, privateKey });

  return async (): Promise<GateConnector | null> => {
    try {
      return githubGate({ owner, repo, token: await auth.token(), appId });
    } catch (error) {
      logger?.error(
        "Maple could not mint the gate App's token, so no gate was published.",
        error instanceof Error ? error : new Error(String(error)),
      );
      return null;
    }
  };
}
