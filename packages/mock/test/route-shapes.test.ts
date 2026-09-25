import { routeShapes } from "@maple-kit/mock";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createTestServer, useTestServer } from "./msw/server.js";
import { createShapeRoute, ROUTE_ORIGIN, SHAPES } from "./msw/shapes.js";

const route = createShapeRoute();
const server = createTestServer(...route.handlers);
useTestServer(server, { afterAll, afterEach, beforeAll });
afterEach(() => route.reset());

function lookup() {
  return routeShapes({
    basePath: "/api/maple/",
    fetch: (...args) => fetch(...args),
    origin: ROUTE_ORIGIN,
  });
}

describe("shapes read from Maple's route", () => {
  it("asks for every key of one tick in one request, and keeps the answers", async () => {
    const shape = lookup();
    const found = await Promise.all([
      shape("rest:GET /api/projects"),
      shape("trpc:user.me"),
      shape("rest:GET /api/unknown"),
    ]);

    expect(found).toEqual([SHAPES["rest:GET /api/projects"], SHAPES["trpc:user.me"], undefined]);
    expect(route.asked).toEqual([
      ["rest:GET /api/projects", "trpc:user.me", "rest:GET /api/unknown"],
    ]);

    await shape("trpc:user.me");
    await shape("rest:GET /api/unknown");
    expect(route.asked).toHaveLength(1);
  });

  it("drops an entry that is not a shape", async () => {
    await expect(lookup()("rest:GET /junk")).resolves.toBeUndefined();
  });

  it("answers nothing, and does not throw, when the route fails", async () => {
    const shape = lookup();
    await expect(Promise.all([shape("broken:a"), shape("trpc:user.me")])).resolves.toEqual([
      undefined,
      undefined,
    ]);
  });
});
