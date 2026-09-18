import { CONNECTOR_METHODS, REQUIRED_METHODS } from "@maplekit/core";

import type { ConnectorKind } from "@maplekit/core";

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

/** Renders one row as two aligned lines. */
function renderRow(row: ConnectorKindRow): string {
  const optional = row.optional.length > 0 ? row.optional.join(", ") : "none";
  const indent = " ".repeat(16);
  return `  ${row.kind.padEnd(14)}required: ${row.required.join(", ")}\n${indent}optional: ${optional}`;
}

/** Renders the matrix as plain text. */
export function renderConnectorKinds(rows: readonly ConnectorKindRow[]): string {
  return ["Connector kinds", ...rows.map(renderRow)].join("\n");
}
