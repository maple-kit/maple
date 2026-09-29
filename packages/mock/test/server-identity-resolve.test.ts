import { createInventory, meetsNeed, resolve, restCodec } from "@maple-kit/mock";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { API, createApiFake } from "./msw/api.js";
import { createTestServer, useTestServer } from "./msw/server.js";

import type { IdentityRules, Recipe } from "@maple-kit/core/mock";

const api = createApiFake();
const server = createTestServer(...api.handlers);
useTestServer(server, { afterAll, afterEach, beforeAll });
afterEach(() => api.reset());

/** Rules from a server render: no identity call, so no sample can say who the reviewer is. */
const RULES: IdentityRules = {
  role: { values: ["owner", "barista", "trainee"] },
  permissions: { values: ["project:delete"] },
  requires: {
    "rest:GET /api/audit": { roles: ["owner"] },
    "rest:DELETE /api/projects/:id": { permission: "project:delete" },
  },
  server: { current: { role: "barista", permissions: [] } },
};

const shownAs = (as: NonNullable<Recipe["as"]>): Recipe => ({ version: 2, calls: [], as });

async function under(active: Recipe, url: string, rules = RULES, init?: RequestInit) {
  return resolve(new Request(`${API}${url}`, init), active, createInventory(), {
    codecs: [restCodec],
    forward: (request) => fetch(request),
    route: "/p",
    identity: rules,
  });
}

describe("resolve, under `as` with an identity a server rendered", () => {
  it("answers 403 for a call the recipe's role may not make, with no identity call recorded", async () => {
    const response = await under(shownAs({ role: "trainee" }), "/audit");
    expect(response?.status).toBe(403);
    expect(api.reached).toEqual([]);
  });

  it("lets through a call the recipe's role may make", async () => {
    await expect(under(shownAs({ role: "owner" }), "/audit")).resolves.toBeUndefined();
  });

  it("judges by the role the server rendered when `as` names none", async () => {
    const response = await under(shownAs({ permissions: {} }), "/audit");
    expect(response?.status).toBe(403);
  });

  it("judges a permission by what the server rendered, and by the recipe over it", async () => {
    const held: IdentityRules = {
      ...RULES,
      server: { current: { role: "owner", permissions: ["project:delete"] } },
    };
    const init = { method: "DELETE" };
    await expect(
      under(shownAs({ role: "guest" }), "/projects/1", held, init),
    ).resolves.toBeUndefined();
    const taken = await under(
      shownAs({ permissions: { "project:delete": false } }),
      "/projects/1",
      held,
      init,
    );
    expect(taken?.status).toBe(403);
  });

  it("cannot judge a need when nobody is signed in, so the server decides", async () => {
    const nobody: IdentityRules = { ...RULES, server: { current: null } };
    await expect(under(shownAs({ permissions: {} }), "/audit", nobody)).resolves.toBeUndefined();
  });

  it("weighs every role the server rendered", () => {
    const rules: IdentityRules = { ...RULES, server: { current: { roles: ["barista", "owner"] } } };
    const real = { role: "barista", roles: ["barista", "owner"] };
    expect(meetsNeed("rest:GET /api/audit", {}, rules, real)).toBe(true);
    expect(meetsNeed("rest:GET /api/audit", { role: "trainee" }, rules, real)).toBe(false);
  });
});
