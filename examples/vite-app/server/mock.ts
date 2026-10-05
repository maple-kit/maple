/** What Maple Mock is told about this page, for the Vite servers and the Worker. */

import { keywordClassifier } from "@maple-kit/core/connectors";

import type { ClassifierConnector } from "@maple-kit/core/connectors";
import type { MockRouteOptions } from "@maple-kit/core/route";

/**
 * The page's API, described for Maple Mock; served per call, never bundled.
 * A sentence is planned by the model when it can plan, and by keyword otherwise.
 */
export function exampleMock(
  document: unknown,
  preview: boolean,
  classifier?: ClassifierConnector,
): MockRouteOptions {
  return {
    preview,
    schemas: [{ codec: "rest", document }],
    // Who the page is told the reviewer is, for a recipe's `as`. The role and
    // permission words come from the session's own schema.
    identity: {
      call: "rest:GET /api/session",
      role: { path: "role" },
      permissions: { path: "permissions" },
      requires: { "rest:GET /api/audit": { roles: ["owner"] } },
    },
    plan: { classifier: classifier?.plan ? classifier : keywordClassifier() },
  };
}
