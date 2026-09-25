import { routeIdentity } from "@maple-kit/mock";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createIdentityRoute, RULES } from "./msw/identity.js";
import { createTestServer, useTestServer } from "./msw/server.js";
import { ROUTE_ORIGIN } from "./msw/shapes.js";

const server = createTestServer(...createIdentityRoute().handlers);
useTestServer(server, { afterAll, afterEach, beforeAll });

describe("identity rules read from Maple's route", () => {
  it.each([
    ["the rules it serves", "rules", RULES],
    ["nothing when it fails", "broken", undefined],
    ["nothing when it declares none", "absent", undefined],
    ["nothing for an answer that is not rules", "junk", undefined],
  ] as const)("gives back %s", async (_, answer, expected) => {
    server.use(...createIdentityRoute(answer).handlers);
    const rules = routeIdentity({ basePath: "/api/maple/", fetch, origin: ROUTE_ORIGIN });
    await expect(rules).resolves.toEqual(expected);
  });
});
