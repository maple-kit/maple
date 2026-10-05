/**
 * SARIF 2.1.0, which is what GitHub code scanning and most review tools read.
 *
 * A finding with a source location is anchored to its file; one without keeps
 * its selector as a logical location, because a result with no location at
 * all is rejected by an upload.
 */

import { placeOf } from "./place.js";

import type { Finding, Severity } from "../types.js";

/** The SARIF log, as much of it as this writer produces. */
export interface SarifLog {
  readonly version: "2.1.0";
  readonly $schema: string;
  readonly runs: readonly unknown[];
}

const LEVEL: Readonly<Record<Severity, string>> = {
  error: "error",
  warn: "warning",
  advice: "note",
};

/** What turns findings into a log. */
export interface SarifOptions {
  /** The checkout, so an absolute `source` can be made relative. */
  readonly root?: string;
}

function locationOf(finding: Finding, root?: string): unknown {
  const place = placeOf(finding, root);
  if (place === undefined) {
    const name = finding.anchor.selector ?? finding.anchor.component ?? "page";
    return { logicalLocations: [{ name, kind: "element" }] };
  }
  return {
    physicalLocation: {
      artifactLocation: { uri: place.path },
      region: {
        startLine: place.line,
        ...(place.column === undefined ? {} : { startColumn: place.column }),
      },
    },
  };
}

function ruleOf(finding: Finding): unknown {
  return {
    id: finding.rule,
    ...(finding.url === undefined ? {} : { helpUri: finding.url }),
  };
}

/** The SARIF log for one lint run. */
export function toSarif(findings: readonly Finding[], options: SarifOptions = {}): SarifLog {
  const rules = new Map(findings.map((found) => [found.rule, ruleOf(found)]));
  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: { driver: { name: "maple/design-lint", rules: [...rules.values()] } },
        results: findings.map((found) => ({
          ruleId: found.rule,
          level: LEVEL[found.severity],
          message: { text: found.message },
          locations: [locationOf(found, options.root)],
        })),
      },
    ],
  };
}
