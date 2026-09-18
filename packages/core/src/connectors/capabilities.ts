/**
 * Capability detection. A connector's capabilities are exactly the methods it
 * defines, so there is no second place for the two to disagree.
 *
 * The same tables drive the matrix in docs/connectors.md, which is why they are
 * exported rather than inlined.
 */

import type { AnyConnector, ConnectorKind } from "./types.js";

/** Every method Maple may call on a connector, by kind. */
export const CONNECTOR_METHODS = {
  store: ["list", "append", "setStatus", "watch"],
  media: ["putBlob", "getUrl", "remove"],
  observability: ["getReplayLink", "fetchEvents"],
  identity: ["resolveUser"],
} as const satisfies Record<ConnectorKind, readonly string[]>;

/** The methods a connector of each kind must define to be usable at all. */
export const REQUIRED_METHODS = {
  store: ["list", "append"],
  media: ["putBlob", "getUrl"],
  observability: ["getReplayLink"],
  identity: ["resolveUser"],
} as const satisfies Record<ConnectorKind, readonly string[]>;

/** The method names valid for a given connector kind. */
export type ConnectorMethod<K extends ConnectorKind> = (typeof CONNECTOR_METHODS)[K][number];

/** Which methods a connector actually implements. */
export type CapabilityReport<K extends ConnectorKind> = Readonly<
  Record<ConnectorMethod<K>, boolean>
>;

/** Raised when a connector is missing a method its kind cannot work without. */
export class MissingCapabilityError extends Error {
  override readonly name = "MissingCapabilityError";

  constructor(
    readonly connector: string,
    readonly kind: ConnectorKind,
    readonly missing: readonly string[],
  ) {
    super(
      `Connector "${connector}" cannot be used as a ${kind} connector: ` +
        `missing required method(s) ${missing.join(", ")}.`,
    );
  }
}

/** True when `connector` defines `method` as a callable. */
export function supports(connector: AnyConnector, method: string): boolean {
  return typeof (connector as unknown as Record<string, unknown>)[method] === "function";
}

/** Reports which of `kind`'s methods `connector` implements. */
export function capabilitiesOf<K extends ConnectorKind>(
  kind: K,
  connector: AnyConnector,
): CapabilityReport<K> {
  const report: Record<string, boolean> = {};
  for (const method of CONNECTOR_METHODS[kind]) report[method] = supports(connector, method);
  return report as CapabilityReport<K>;
}

/** The required methods `connector` does not implement. */
export function missingRequirements(kind: ConnectorKind, connector: AnyConnector): string[] {
  return REQUIRED_METHODS[kind].filter((method) => !supports(connector, method));
}

/** Throws unless `connector` implements every method `kind` requires. */
export function assertUsable<K extends ConnectorKind>(kind: K, connector: AnyConnector): void {
  const missing = missingRequirements(kind, connector);
  if (missing.length > 0) {
    throw new MissingCapabilityError(connector.name, kind, missing);
  }
}
