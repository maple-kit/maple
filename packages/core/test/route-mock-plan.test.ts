import { describe, expect, it, vi } from "vitest";

import { keywordClassifier } from "../src/connectors/keyword.js";
import { createLogger, memorySink } from "../src/logger/index.js";
import { createMapleHandler } from "../src/route/index.js";
import { memoryClassifier } from "../src/testing/memory-classifier.js";

import type {
  ClassifierConnector,
  IdentityConnector,
  MockPlanRequest,
} from "../src/connectors/types.js";
import type { SchemaDocument } from "../src/mock/index.js";
import type { RouteOptions } from "../src/route/index.js";

const BASE = "https://preview.example.com/api/maple";

const DOCUMENT: SchemaDocument = {
  codec: "rest",
  document: {
    paths: {
      "/api/roasts": {
        get: {
          responses: {
            "200": {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    title: "RoastPage",
                    properties: {
                      items: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: { id: { type: "string" }, origin: { type: "string" } },
                        },
                      },
                      nextCursor: { type: ["string", "null"] },
                    },
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

const ASKED = {
  request: "no roasts yet",
  route: "/roasts",
  calls: [
    { key: "rest:GET /api/roasts", summary: "" },
    { key: "rest:GET /api/me", summary: "the signed-in user" },
  ],
};

const signedIn: IdentityConnector = {
  name: "test-identity",
  resolveUser: (request) =>
    Promise.resolve(request.headers["cookie"] === "session=ok" ? { id: "u_1", name: "R" } : null),
};

/** A classifier that plans with the keyword planner and keeps what it was asked. */
function recording(): { classifier: ClassifierConnector; asked: MockPlanRequest[] } {
  const asked: MockPlanRequest[] = [];
  const keyword = keywordClassifier();
  return {
    asked,
    classifier: {
      name: "recording",
      pillars: [],
      plan: (request) => {
        asked.push(request);
        return keyword.plan!(request);
      },
    },
  };
}

function handler(classifier: ClassifierConnector, extra: Partial<RouteOptions> = {}) {
  return createMapleHandler({
    mock: { preview: true, schemas: [DOCUMENT], plan: { classifier } },
    ...extra,
  });
}

function post(body: unknown, init: RequestInit = {}): Request {
  return new Request(`${BASE}/mock/plan`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    ...init,
  });
}

describe("POST /mock/plan", () => {
  it("answers the classifier's plan, uncached by anything in between", async () => {
    const response = await handler(keywordClassifier())(post(ASKED));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { plan } = (await response.json()) as { plan: { state: string; calls: unknown[] } };
    expect(plan.state).toBe("empty");
    expect(plan.calls).toHaveLength(2);
  });

  it("adds what each call's shape says it returns after the page's words", async () => {
    const { classifier, asked } = recording();
    await handler(classifier)(post(ASKED));

    const [roasts, me] = asked[0]?.calls ?? [];
    expect(roasts?.summary).toBe("RoastPage: items [id, origin], nextCursor");
    expect(me?.summary).toBe("the signed-in user");
  });

  it("answers a blank sentence with no plan, and asks nobody", async () => {
    const classifier = memoryClassifier();
    const response = await handler(classifier)(post({ ...ASKED, request: "  " }));

    await expect(response.json()).resolves.toEqual({ plan: null });
    expect(classifier.asked()).toEqual([]);
  });

  it("plans a sentence once, however often it is asked", async () => {
    const classifier = memoryClassifier({ state: "empty" });
    const handle = handler(classifier);
    await handle(post(ASKED));
    await handle(post(ASKED));

    expect(classifier.asked()).toEqual(["no roasts yet"]);
  });

  it.each<[string, RouteOptions]>([
    ["no mock options", {}],
    ["no plan options", { mock: { preview: true } }],
    [
      "a build that is not a preview",
      { mock: { preview: false, plan: { classifier: keywordClassifier() } } },
    ],
    [
      "a classifier that does not plan",
      { mock: { preview: true, plan: { classifier: memoryClassifier({ methods: ["score"] }) } } },
    ],
  ])("answers 404 with %s", async (_name, options) => {
    expect((await createMapleHandler(options)(post(ASKED))).status).toBe(404);
  });

  it("answers 405 to anything but POST", async () => {
    const response = await handler(keywordClassifier())(
      new Request(`${BASE}/mock/plan`, { method: "GET" }),
    );
    expect(response.status).toBe(405);
  });

  it.each<[string, unknown]>([
    ["no body", null],
    ["a request that is not a string", { ...ASKED, request: 3 }],
    ["a request too long to be a sentence", { ...ASKED, request: "x".repeat(501) }],
    ["a route that is not a path", { ...ASKED, route: "roasts" }],
    ["calls that are not a list", { ...ASKED, calls: {} }],
    [
      "too many calls",
      { ...ASKED, calls: Array.from({ length: 101 }, (_, n) => ({ key: `k:${n}` })) },
    ],
    ["a key without a codec", { ...ASKED, calls: [{ key: "GET /api/roasts", summary: "" }] }],
    ["a summary that is not a string", { ...ASKED, calls: [{ key: "rest:GET /x", summary: 1 }] }],
  ])("answers 400 to %s", async (_name, body) => {
    expect((await handler(keywordClassifier())(post(body))).status).toBe(400);
  });

  it("plans only for a resolved reviewer when an identity connector is set", async () => {
    const handle = handler(keywordClassifier(), { identity: signedIn });

    expect((await handle(post(ASKED))).status).toBe(401);
    expect((await handle(post(ASKED, { headers: { cookie: "session=ok" } }))).status).toBe(200);
  });

  it("answers 429 once a session has spent its window, and counts sessions apart", async () => {
    const handle = createMapleHandler({
      identity: {
        name: "any",
        resolveUser: (r) => Promise.resolve({ id: r.headers["cookie"] ?? "", name: "R" }),
      },
      mock: {
        preview: true,
        plan: { classifier: keywordClassifier(), rate: { limit: 1, windowMs: 60_000 } },
      },
    });
    const as = (cookie: string, request: string) =>
      post({ ...ASKED, request }, { headers: { cookie } });

    expect((await handle(as("a", "empty"))).status).toBe(200);
    expect((await handle(as("a", "error"))).status).toBe(429);
    expect((await handle(as("b", "error"))).status).toBe(200);
  });

  it("answers 502 when the classifier fails, and logs why without telling the page", async () => {
    const sink = memorySink();
    const failing: ClassifierConnector = {
      name: "failing",
      pillars: [],
      plan: () => Promise.reject(new Error("upstream said: key sk-live is out of credit")),
    };
    const response = await handler(failing, { logger: createLogger({ sinks: [sink] }) })(
      post(ASKED),
    );

    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("sk-live");
    expect(sink.records.map((record) => record.message)).toContain(
      "A mock request could not be planned.",
    );
  });

  it("hands the classifier the request's signal, so an abandoned plan stops", async () => {
    const plan = vi.fn((request: MockPlanRequest) => keywordClassifier().plan!(request));
    await handler({ name: "spy", pillars: [], plan })(post(ASKED));

    expect(plan.mock.calls[0]?.[0].signal).toBeInstanceOf(AbortSignal);
  });
});
