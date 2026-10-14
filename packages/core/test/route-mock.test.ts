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

describe("GET /mock/identity", () => {
  const SESSION: SchemaDocument = {
    codec: "rest",
    document: {
      paths: {
        "/api/session": {
          get: {
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: { role: { type: "string", enum: ["owner", "barista"] } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
  const identity = {
    call: "rest:GET /api/session",
    role: { path: "role" },
    requires: { "rest:GET /api/audit": { roles: ["owner"] } },
  };
  const read = (init?: RequestInit) => new Request(`${BASE}/mock/identity`, init);

  it("serves the host's rules with the roles read from the call's shape", async () => {
    const handle = createMapleHandler({ mock: { preview: true, schemas: [SESSION], identity } });
    const response = await handle(read());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      identity: { ...identity, role: { path: "role", values: ["owner", "barista"] } },
    });
  });

  it.each([
    ["a build that is not a preview", { mock: { preview: false, identity } }],
    ["a build that is not a preview and has no rules", { mock: { preview: false } }],
    ["no mock options", {}],
  ])("answers 404 with %s", async (_name, options) => {
    expect((await createMapleHandler(options)(read())).status).toBe(404);
  });

  it("answers 200 with no rules when a preview declares none", async () => {
    const handle = createMapleHandler({ mock: { preview: true, schemas: [SESSION] } });
    const response = await handle(read());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ identity: null });
  });

  it("still gates a preview with no rules to a reviewer the connector resolves", async () => {
    const gated = createMapleHandler({ identity: signedIn, mock: { preview: true } });
    expect((await gated(read())).status).toBe(401);
    expect((await gated(read({ headers: { cookie: "session=ok" } }))).status).toBe(200);
  });

  it("answers 405 to anything but GET, and 401 to a reviewer nobody resolves", async () => {
    const open = createMapleHandler({ mock: { preview: true, identity } });
    expect((await open(read({ method: "POST" }))).status).toBe(405);

    const gated = createMapleHandler({ identity: signedIn, mock: { preview: true, identity } });
    expect((await gated(read())).status).toBe(401);
    expect((await gated(read({ headers: { cookie: "session=ok" } }))).status).toBe(200);
  });
});

describe("GET /mock/calls", () => {
  const operation = (summary?: string) => ({
    get: {
      ...(summary === undefined ? {} : { summary }),
      responses: { "200": { content: { "application/json": { schema: { type: "object" } } } } },
    },
  });
  const many: SchemaDocument = {
    codec: "rest",
    prefix: "/api",
    document: {
      paths: {
        "/orders": operation("List orders"),
        "/orders/{id}": operation("One order"),
        "/beans": operation(),
        ...Object.fromEntries(Array.from({ length: 24 }, (_, n) => [`/bulk/${n}`, operation()])),
      },
    },
  };
  const list = (query: string, init?: RequestInit) =>
    new Request(`${BASE}/mock/calls?${query}`, init);

  it("lists 20 calls a page, and the cursor reaches the rest", async () => {
    const handle = createMapleHandler({ mock: { preview: true, schemas: [many] } });
    const first = (await (await handle(list(""))).json()) as { calls: unknown[]; next?: string };
    expect(first.calls).toHaveLength(20);
    expect(first.next).toBe("20");

    const second = (await (await handle(list("cursor=20"))).json()) as {
      calls: unknown[];
      next?: string;
    };
    expect(second.calls).toHaveLength(7);
    expect(second.next).toBeUndefined();
  });

  it("matches the query on path and summary, whatever the case", async () => {
    const handle = createMapleHandler({ mock: { preview: true, schemas: [many] } });
    const byPath = await handle(list("q=BEANS"));
    await expect(byPath.json()).resolves.toEqual({
      calls: [{ key: "rest:GET /api/beans", method: "GET", path: "/api/beans" }],
    });
    const bySummary = await handle(list("q=one+order"));
    await expect(bySummary.json()).resolves.toEqual({
      calls: [
        {
          key: "rest:GET /api/orders/{id}",
          method: "GET",
          path: "/api/orders/{id}",
          summary: "One order",
        },
      ],
    });
  });

  it("answers an empty list when no schemas are configured", async () => {
    const handle = createMapleHandler({ mock: { preview: true } });
    await expect((await handle(list(""))).json()).resolves.toEqual({ calls: [] });
  });

  it.each([
    ["no mock options at all", {}],
    ["a build that is not a preview", { mock: { preview: false, schemas: [many] } }],
  ])("answers 404 with %s", async (_name, options) => {
    expect((await createMapleHandler(options)(list(""))).status).toBe(404);
  });

  it("answers 405 to anything but GET, and 400 to a bad cursor or a long query", async () => {
    const handle = createMapleHandler({ mock: { preview: true, schemas: [many] } });
    expect((await handle(list("", { method: "POST" }))).status).toBe(405);
    expect((await handle(list("cursor=-1"))).status).toBe(400);
    expect((await handle(list("cursor=abc"))).status).toBe(400);
    expect((await handle(list(`q=${"a".repeat(201)}`))).status).toBe(400);
  });

  it("serves only a resolved reviewer when an identity connector is set", async () => {
    const handle = createMapleHandler({
      identity: signedIn,
      mock: { preview: true, schemas: [many] },
    });
    expect((await handle(list(""))).status).toBe(401);
    expect((await handle(list("", { headers: { cookie: "session=ok" } }))).status).toBe(200);
  });

  it("counts searches against the reviewer, on the plan's rate", async () => {
    const classifier = { name: "c", classify: () => Promise.resolve({}) };
    const handle = createMapleHandler({
      identity: signedIn,
      mock: {
        preview: true,
        schemas: [many],
        plan: { classifier: classifier as never, rate: { limit: 2, windowMs: 60_000 } },
      },
    });
    const ok = { headers: { cookie: "session=ok" } };
    expect((await handle(list("", ok))).status).toBe(200);
    expect((await handle(list("", ok))).status).toBe(200);
    expect((await handle(list("", ok))).status).toBe(429);
  });
});
