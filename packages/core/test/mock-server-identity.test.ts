import { isIdentityRules, isServerIdentity, serverIdentityRules } from "@maple-kit/core/mock";
import { describe, expect, it, vi } from "vitest";

import { createMapleHandler } from "../src/route/index.js";

import type { IdentityConnector } from "../src/connectors/types.js";
import type { ServerIdentity } from "@maple-kit/core/mock";

const BASE = "https://preview.example.com/api/maple";
const read = (init?: RequestInit) => new Request(`${BASE}/mock/identity`, init);

const source: ServerIdentity = {
  read: () => Promise.resolve(null),
  roles: ["barista", "trainee"],
  permissions: ["roast:delete"],
  requires: {
    "rest:GET /api/audit": { roles: ["owner"] },
    "rest:POST /api/orders": { permission: "orders:write" },
  },
};

describe("serverIdentityRules", () => {
  it("lists the source's words with those `requires` names, and who was read", () => {
    const current = { role: "barista", permissions: ["roast:delete"] };
    const rules = serverIdentityRules(source, current);
    expect(rules).toEqual({
      role: { values: ["barista", "trainee", "owner"] },
      permissions: { values: ["roast:delete", "orders:write"] },
      requires: source.requires,
      server: { current },
    });
    expect(isIdentityRules(rules)).toBe(true);
  });

  it("carries a null read as nobody, and no permissions when none are listed", () => {
    const rules = serverIdentityRules(
      { read: () => Promise.resolve(null), roles: ["owner"] },
      null,
    );
    expect(rules).toEqual({ role: { values: ["owner"] }, requires: {}, server: { current: null } });
    expect(isIdentityRules(rules)).toBe(true);
  });

  it.each([
    ["a source with a read function", source, true],
    ["a source with a call", { call: "rest:GET /api/session" }, false],
  ])("tells %s", (_, one, expected) => {
    expect(isServerIdentity(one)).toBe(expected);
  });

  it.each([
    ["neither a call nor a server render", { role: { values: ["owner"] }, requires: {} }],
    ["a server render of the wrong shape", { requires: {}, server: { current: { role: 3 } } }],
    [
      "words that are not strings",
      { requires: {}, server: { current: null }, role: { values: [1] } },
    ],
  ])("rejects rules with %s", (_, value) => {
    expect(isIdentityRules(value)).toBe(false);
  });
});

describe("GET /mock/identity with a server-rendered identity", () => {
  const signedIn: IdentityConnector = {
    name: "test-identity",
    resolveUser: (request) =>
      Promise.resolve(request.headers["cookie"] === "session=ok" ? { id: "u_1", name: "R" } : null),
  };

  it("serves the rules with who the host read from this request", async () => {
    const seen = vi.fn((request: Request) =>
      Promise.resolve({ role: "barista", permissions: [request.headers.get("x-test") ?? ""] }),
    );
    const handle = createMapleHandler({
      mock: { preview: true, identity: { ...source, read: seen } },
    });
    const response = await handle(read({ headers: { "x-test": "roast:delete" } }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      identity: serverIdentityRules(source, { role: "barista", permissions: ["roast:delete"] }),
    });
    expect(seen).toHaveBeenCalledOnce();
  });

  it("answers 200 with `current: null` when the host reads nobody", async () => {
    const handle = createMapleHandler({ mock: { preview: true, identity: source } });
    const response = await handle(read());

    expect(response.status).toBe(200);
    const body = (await response.json()) as { identity: { server: { current: unknown } } };
    expect(body.identity.server.current).toBeNull();
  });

  it("answers 404 outside a preview, without asking the host", async () => {
    const seen = vi.fn(() => Promise.resolve(null));
    const handle = createMapleHandler({
      mock: { preview: false, identity: { ...source, read: seen } },
    });
    expect((await handle(read())).status).toBe(404);
    expect(seen).not.toHaveBeenCalled();
  });

  it("asks the host only of a reviewer Maple's identity connector resolves", async () => {
    const seen = vi.fn(() => Promise.resolve(null));
    const handle = createMapleHandler({
      identity: signedIn,
      mock: { preview: true, identity: { ...source, read: seen } },
    });
    expect((await handle(read())).status).toBe(401);
    expect(seen).not.toHaveBeenCalled();

    expect((await handle(read({ headers: { cookie: "session=ok" } }))).status).toBe(200);
    expect(seen).toHaveBeenCalledOnce();
  });
});
