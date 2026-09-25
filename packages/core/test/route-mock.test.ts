import { describe, expect, it, vi } from "vitest";

import { createMapleHandler } from "../src/route/index.js";

import type { IdentityConnector } from "../src/connectors/types.js";
import type { SchemaDocument } from "../src/mock/index.js";

const BASE = "https://preview.example.com/api/maple";

const DOCUMENT: SchemaDocument = {
  codec: "rest",
  document: {
    paths: {
      "/api/reviews": {
        get: {
          responses: { "200": { content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
    },
  },
};

const signedIn: IdentityConnector = {
  name: "test-identity",
  resolveUser: (request) =>
    Promise.resolve(request.headers["cookie"] === "session=ok" ? { id: "u_1", name: "R" } : null),
};

function ask(keys: string[], init?: RequestInit): Request {
  const query = keys.map((key) => `key=${encodeURIComponent(key)}`).join("&");
  return new Request(`${BASE}/mock/schema?${query}`, init);
}

describe("GET /mock/schema", () => {
  it("serves the shapes of the keys asked about, and leaves out the rest", async () => {
    const handle = createMapleHandler({ mock: { preview: true, schemas: [DOCUMENT] } });
    const response = await handle(ask(["rest:GET /api/reviews", "rest:GET /api/nothing"]));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      shapes: { "rest:GET /api/reviews": { schema: { type: "object" }, source: "supplied" } },
    });
  });

  it.each([
    ["no mock options at all", {}],
    ["a build that is not a preview", { mock: { preview: false, schemas: [DOCUMENT] } }],
  ])("answers 404 with %s", async (_name, options) => {
    expect((await createMapleHandler(options)(ask(["rest:GET /api/reviews"]))).status).toBe(404);
  });

  it("answers 405 to anything but GET, and 400 without a key or with too many", async () => {
    const handle = createMapleHandler({ mock: { preview: true, schemas: [DOCUMENT] } });
    expect((await handle(ask(["k:a"], { method: "POST" }))).status).toBe(405);
    expect((await handle(ask([]))).status).toBe(400);
    expect((await handle(ask(Array.from({ length: 101 }, (_, n) => `k:${n}`)))).status).toBe(400);
  });

  it("serves only a resolved reviewer when an identity connector is set", async () => {
    const handle = createMapleHandler({
      identity: signedIn,
      mock: { preview: true, schemas: [DOCUMENT] },
    });
    expect((await handle(ask(["rest:GET /api/reviews"]))).status).toBe(401);
    const allowed = await handle(
      ask(["rest:GET /api/reviews"], { headers: { cookie: "session=ok" } }),
    );
    expect(allowed.status).toBe(200);
  });

  it("reads the documents once, on the first request", async () => {
    const schemas = vi.fn(() => Promise.resolve([DOCUMENT]));
    const handle = createMapleHandler({ mock: { preview: true, schemas } });
    expect(schemas).not.toHaveBeenCalled();

    await handle(ask(["rest:GET /api/reviews"]));
    await handle(ask(["rest:GET /api/reviews"]));
    expect(schemas).toHaveBeenCalledTimes(1);
  });
});
