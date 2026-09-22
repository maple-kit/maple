/**
 * Choosing the gate for one request. The publishing itself is in
 * `@maple-kit/core/gate`, because the route is not the only caller.
 */

import type { GateConnector, IdentityRequest } from "../connectors/types.js";

/**
 * Chooses the gate for one request, for the same reason a store is chosen per
 * request. Null means this deployment publishes no gate.
 */
export type GateResolver = (
  request: IdentityRequest,
) => GateConnector | null | Promise<GateConnector | null>;

/** A plain connector is used as it is; a resolver is asked, every request. */
export async function gateFor(
  chosen: GateConnector | GateResolver | undefined,
  request: IdentityRequest,
): Promise<GateConnector | null> {
  if (chosen === undefined) return null;
  return typeof chosen === "function" ? await chosen(request) : chosen;
}
