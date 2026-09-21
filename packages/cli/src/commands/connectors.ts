import { CONNECTOR_METHODS, REQUIRED_METHODS } from "@maple-kit/core";

import type { ConnectorKind } from "@maple-kit/core";

/** One row of the capability matrix, as `maple connectors` prints it. */
export interface ConnectorKindRow {
  readonly kind: ConnectorKind;
  readonly required: readonly string[];
  readonly optional: readonly string[];
}

/** Builds the matrix from core's tables, so the CLI cannot drift from the code. */
export function connectorKindRows(): readonly ConnectorKindRow[] {
  return (Object.keys(CONNECTOR_METHODS) as ConnectorKind[]).map((kind) => {
    const required: readonly string[] = REQUIRED_METHODS[kind];
    return {
      kind,
      required,
      optional: CONNECTOR_METHODS[kind].filter((method) => !required.includes(method)),
    };
  });
}

/** Renders one row as two aligned lines. A kind may require nothing at all. */
function renderRow(row: ConnectorKindRow): string {
  const indent = " ".repeat(16);
  const required = listed(row.required);
  return `  ${row.kind.padEnd(14)}required: ${required}\n${indent}optional: ${listed(row.optional)}`;
}

/** An empty list reads as "none", never as a blank nobody can interpret. */
function listed(methods: readonly string[]): string {
  return methods.length > 0 ? methods.join(", ") : "none";
}

/** Renders the matrix as plain text. */
export function renderConnectorKinds(rows: readonly ConnectorKindRow[]): string {
  return ["Connector kinds", ...rows.map(renderRow)].join("\n");
}
