import { describe, expect, it } from "vitest";

import { createMapleHandler } from "../src/route/index.js";
import { sampleComment } from "../src/testing/fixtures.js";
import { memoryStore } from "../src/testing/memory-store.js";

import type { IdentityConnector, StoreConnector } from "../src/connectors/types.js";

const BASE = "https://preview.example.com";

function handler(overrides: { store?: StoreConnector; identity?: IdentityConnector } = {}) {
  return createMapleHandler({ store: overrides.store ?? memoryStore(), ...overrides });
}

function request(method: string, path: string, body?: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const reviewer: IdentityConnector = {
  name: "test-identity",
  resolveUser: (incoming) =>
    Promise.resolve(
      incoming.headers["cookie"] === "session=valid" ? { id: "u_7", name: "Reviewer" } : null,
    ),
};

describe("routing", () => {
  it("serves nothing outside its base path", async () => {
    expect((await handler()(request("GET", "/comments?branch=main"))).status).toBe(404);
  });

  it("can be mounted somewhere else", async () => {
    const handle = createMapleHandler({ store: memoryStore(), basePath: "/_maple" });
    expect((await handle(request("GET", "/_maple/comments?branch=main"))).status).toBe(200);
  });

  it("answers 404 for a path it does not have", async () => {
    expect((await handler()(request("GET", "/api/maple/nothing"))).status).toBe(404);
  });

  it("answers 405 for the wrong method on a path it does have", async () => {
    expect((await handler()(request("DELETE", "/api/maple/comments"))).status).toBe(405);
  });

  it("never caches a response", async () => {
    const response = await handler()(request("GET", "/api/maple/comments?branch=main"));
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("listing comments", () => {
  it("requires a branch rather than guessing one", async () => {
    const response = await handler()(request("GET", "/api/maple/comments"));
    expect(response.status).toBe(400);
  });

  it("returns the page the store returned", async () => {
    const store = memoryStore();
    await store.append(sampleComment({ branch: "main" }));

    const response = await handler({ store })(request("GET", "/api/maple/comments?branch=main"));
    const page = (await response.json()) as { comments: unknown[] };
    expect(page.comments).toHaveLength(1);
  });

  it("passes the limit and cursor through", async () => {
    const store = memoryStore();
    for (const body of ["a", "b", "c"]) await store.append(sampleComment({ branch: "main", body }));

    const first = await handler({ store })(
      request("GET", "/api/maple/comments?branch=main&limit=2"),
    );
    const page = (await first.json()) as { comments: unknown[]; cursor?: string };
    expect(page.comments).toHaveLength(2);
    expect(page.cursor).toBeTruthy();
  });

  it("ignores a status it does not recognise rather than failing", async () => {
    const response = await handler()(
      request("GET", "/api/maple/comments?branch=main&status=nonsense"),
    );
    expect(response.status).toBe(200);
  });

  it("turns a store's complaint into a 400, not a 500", async () => {
    const response = await handler()(request("GET", "/api/maple/comments?branch=main&limit=-1"));
    expect(response.status).toBe(400);
  });
});

describe("writing a comment", () => {
  it("rejects a body that is not a comment", async () => {
    expect((await handler()(request("POST", "/api/maple/comments", { hi: 1 }))).status).toBe(400);
  });

  it("rejects a body that is not JSON at all", async () => {
    const response = await handler()(
      new Request(`${BASE}/api/maple/comments`, { method: "POST", body: "not json" }),
    );
    expect(response.status).toBe(400);
  });

  it("stamps the author from the session, never from the request", async () => {
    const draft = {
      ...sampleComment({ branch: "main" }),
      author: { id: "u_666", name: "Somebody Else", provenance: "server" },
    };
    const response = await handler({ identity: reviewer })(
      new Request(`${BASE}/api/maple/comments`, {
        method: "POST",
        body: JSON.stringify(draft),
        headers: { cookie: "session=valid" },
      }),
    );

    const stored = (await response.json()) as { author: { id: string; provenance: string } };
    expect(response.status).toBe(201);
    expect(stored.author.id).toBe("u_7");
    expect(stored.author.provenance).toBe("server");
  });

  it("marks a comment written without a session as a guest's", async () => {
    const response = await handler({ identity: reviewer })(
      request("POST", "/api/maple/comments", sampleComment({ branch: "main" })),
    );

    const stored = (await response.json()) as { author: { provenance: string } };
    expect(stored.author.provenance).toBe("guest");
  });
});

describe("changing a status", () => {
  it("changes it", async () => {
    const store = memoryStore();
    const stored = await store.append(sampleComment({ branch: "main" }));

    const response = await handler({ store })(
      request("PATCH", `/api/maple/comments/${stored.id}`, { status: "resolved" }),
    );
    expect(((await response.json()) as { status: string }).status).toBe("resolved");
  });

  it("rejects a status that is not one", async () => {
    const response = await handler()(
      request("PATCH", "/api/maple/comments/c_1", { status: "definitely-not" }),
    );
    expect(response.status).toBe(400);
  });

  it("says 501 when the store cannot change a status at all", async () => {
    const response = await handler({ store: memoryStore({ appendOnly: true }) })(
      request("PATCH", "/api/maple/comments/c_1", { status: "resolved" }),
    );
    expect(response.status).toBe(501);
  });
});

describe("identity", () => {
  it("reports the reviewer when the session says who they are", async () => {
    const response = await handler({ identity: reviewer })(
      new Request(`${BASE}/api/maple/me`, { headers: { cookie: "session=valid" } }),
    );
    expect((await response.json()) as unknown).toEqual({ user: { id: "u_7", name: "Reviewer" } });
  });

  it("reports nobody rather than failing when there is no identity connector", async () => {
    const response = await handler()(request("GET", "/api/maple/me"));
    expect((await response.json()) as unknown).toEqual({ user: null });
  });
});

describe("when something breaks", () => {
  it("does not hand the store's message to the browser", async () => {
    const exploding: StoreConnector = {
      name: "exploding",
      list: () => Promise.reject(new Error("token ghp_secret expired for org/private-repo")),
      append: () => Promise.reject(new Error("no")),
    };

    const response = await handler({ store: exploding })(
      request("GET", "/api/maple/comments?branch=main"),
    );
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).not.toContain("ghp_secret");
    expect(body).not.toContain("private-repo");
  });
});

describe("mounting on a Node server", () => {
  it("passes a request outside the base path straight on", async () => {
    const { toNodeMiddleware } = await import("../src/route/node.js");
    const middleware = toNodeMiddleware(() => Promise.resolve(new Response("no")), "/api/maple");

    let passed = false;
    middleware({ url: "/index.html", headers: {} } as never, {} as never, () => (passed = true));
    expect(passed).toBe(true);
  });

  it("does not pass on a request inside it", async () => {
    const { toNodeMiddleware } = await import("../src/route/node.js");
    const middleware = toNodeMiddleware(() => Promise.resolve(new Response("ok")), "/api/maple");

    let passed = false;
    middleware(
      { url: "/api/maple/me", method: "GET", headers: { host: "x" }, on: () => undefined } as never,
      { setHeader: () => undefined, end: () => undefined } as never,
      () => (passed = true),
    );
    expect(passed).toBe(false);
  });
});
