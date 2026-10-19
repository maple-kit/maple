import { describe, expect, it } from "vitest";

import { linkRecipeId } from "../src/mock/index.js";
import { createMapleHandler } from "../src/route/index.js";
import { memoryRecipes } from "../src/testing/memory-recipes.js";

import type { IdentityConnector, RecipeStore } from "../src/connectors/types.js";
import type { Recipe } from "../src/mock/index.js";
import type { RouteOptions } from "../src/route/index.js";

const BASE = "https://preview.example.com/api/maple";

const RECIPE: Recipe = {
  version: 2,
  calls: [{ key: "trpc:orders.list", state: "empty" }],
  flags: { "new-roaster": true },
  request: "empty orders, for jo@example.com",
};

const signedIn: IdentityConnector = {
  name: "test-identity",
  resolveUser: (request) =>
    Promise.resolve(request.headers["cookie"] === "session=ok" ? { id: "u_1", name: "R" } : null),
};

function handler(extra: Partial<RouteOptions> = {}, store: RecipeStore | null = memoryRecipes()) {
  return createMapleHandler({
    mock: { preview: true },
    ...(store === null ? {} : { recipes: store }),
    ...extra,
  });
}

function post(body: string, init: RequestInit = {}): Request {
  return new Request(`${BASE}/mock/recipes`, { method: "POST", body, ...init });
}

function get(id: string, init: RequestInit = {}): Request {
  return new Request(`${BASE}/mock/recipes/${id}`, init);
}

async function share(handle: (request: Request) => Promise<Response>, recipe: unknown) {
  const response = await handle(post(JSON.stringify(recipe)));
  return { response, id: ((await response.json()) as { id?: string }).id };
}

describe("POST /mock/recipes", () => {
  it("stores the recipe without the reviewer's words and answers its id", async () => {
    const handle = handler();
    const { response, id } = await share(handle, RECIPE);

    expect(response.status).toBe(200);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    const stored = (await (await handle(get(id!))).json()) as Recipe;
    expect(stored).toEqual({ version: 2, calls: RECIPE.calls, flags: RECIPE.flags });
    expect(stored).not.toHaveProperty("request");
  });

  it("keeps a recipe for 30 days unless the host says otherwise", async () => {
    const seen: Date[] = [];
    const store: RecipeStore = {
      put: (_, { expiresAt }) => {
        seen.push(expiresAt);
        return Promise.resolve("a");
      },
      get: () => Promise.resolve(undefined),
    };
    const day = 86_400_000;
    await share(handler({}, store), RECIPE);
    await share(handler({ mock: { preview: true, recipes: { ttlDays: 2 } } }, store), RECIPE);

    const [thirty, two] = seen.map((at) => Math.round((at.getTime() - Date.now()) / day));
    expect([thirty, two]).toEqual([30, 2]);
  });

  it("refuses what is not a recipe, without echoing it", async () => {
    const secret = "do-not-echo-this-text";
    for (const body of [`{"version":2,"calls":"${secret}"}`, `not json ${secret}`, "[]"]) {
      const response = await handler()(post(body));
      const text = await response.text();

      expect(response.status).toBe(400);
      expect(text).not.toContain(secret);
    }
  });

  it("refuses over 16 KB with 413, by length or by reading, and never echoes it", async () => {
    const filler = "x".repeat(17 * 1024);
    const big = JSON.stringify({ ...RECIPE, request: filler });
    const declared = await handler()(
      post(big, { headers: { "content-length": String(big.length) } }),
    );
    const undeclared = await handler()(post(big));

    expect([declared.status, undeclared.status]).toEqual([413, 413]);
    expect(await declared.text()).not.toContain("xxxx");
  });

  it("answers 404 without a store and when mock preview is off", async () => {
    const none = await handler({}, null)(post(JSON.stringify(RECIPE)));
    const off = await handler({ mock: { preview: false } })(post(JSON.stringify(RECIPE)));

    expect([none.status, off.status]).toEqual([404, 404]);
  });

  it("stores for a signed-out reviewer as well as a signed-in one", async () => {
    const handle = handler({ identity: signedIn });
    const signedOut = await handle(post(JSON.stringify(RECIPE)));
    const accepted = await handle(
      post(JSON.stringify(RECIPE), { headers: { cookie: "session=ok" } }),
    );

    expect([signedOut.status, accepted.status]).toEqual([200, 200]);
  });

  it("counts signed-out reviewers together and a signed-in one apart", async () => {
    const handle = handler({
      identity: signedIn,
      mock: {
        preview: true,
        plan: { classifier: { name: "c", pillars: [] }, rate: { limit: 1, windowMs: 60_000 } },
      },
    });
    const statuses: number[] = [];
    for (let i = 0; i < 2; i += 1)
      statuses.push((await handle(post(JSON.stringify(RECIPE)))).status);
    const own = await handle(post(JSON.stringify(RECIPE), { headers: { cookie: "session=ok" } }));

    expect([...statuses, own.status]).toEqual([200, 429, 200]);
  });

  it("rate limits a reviewer like /mock/plan", async () => {
    const handle = handler({
      mock: {
        preview: true,
        plan: { classifier: { name: "c", pillars: [] }, rate: { limit: 2, windowMs: 60_000 } },
      },
    });
    const statuses: number[] = [];
    for (let i = 0; i < 3; i += 1)
      statuses.push((await handle(post(JSON.stringify(RECIPE)))).status);

    expect(statuses).toEqual([200, 200, 429]);
  });

  it("answers 405 to the wrong method", async () => {
    const response = await handler()(new Request(`${BASE}/mock/recipes`));

    expect(response.status).toBe(405);
  });
});

describe("GET /mock/recipes/{id}", () => {
  it.each(["0".repeat(32), "..%2Fescape", "a b", "x".repeat(200)])("404s for %j", async (id) => {
    expect((await handler()(get(id))).status).toBe(404);
  });

  it("404s for an expired recipe", async () => {
    const store = memoryRecipes();
    const id = await store.put(RECIPE, { expiresAt: new Date(Date.now() - 1) });

    expect((await handler({}, store)(get(id))).status).toBe(404);
  });

  it("answers 404 without a store, and the recipe to a signed-out reviewer", async () => {
    const none = await handler({}, null)(get("abc"));
    const store = memoryRecipes();
    const id = await store.put(RECIPE, { expiresAt: new Date(Date.now() + 60_000) });
    const signedOut = await handler({ identity: signedIn }, store)(get(id));

    expect([none.status, signedOut.status]).toEqual([404, 200]);
  });
});

describe("a 35-call recipe", () => {
  it("links by id in under 200 characters", async () => {
    const calls = Array.from({ length: 35 }, (_, i) => ({
      key: `rest:GET /api/orders/:id/lines/${String(i)}`,
      state: "empty" as const,
    }));
    const { id } = await share(handler(), { version: 2, calls });

    const link = linkRecipeId("https://preview.example.com/orders", id);
    expect(link.href.length).toBeLessThan(200);
    expect(link.searchParams.get("maple-mock-id")).toBe(id);
  });
});
