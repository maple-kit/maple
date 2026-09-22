import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createMapleClient } from "../src/client/index.js";
import { createMapleFake, MAPLE_BASE } from "./msw/maple.js";
import { createTestServer, useTestServer } from "./msw/server.js";

import type { MapleClient, MapleClientOptions } from "../src/client/index.js";
import type { MapleFake, MapleFakeOptions } from "./msw/maple.js";

const server = createTestServer();
useTestServer(server, { beforeAll, afterEach, afterAll });

let fake: MapleFake;

function memoryStorage(): Storage {
  const held = new Map<string, string>();
  return {
    get length() {
      return held.size;
    },
    clear: () => held.clear(),
    getItem: (key: string) => held.get(key) ?? null,
    key: (index: number) => [...held.keys()][index] ?? null,
    removeItem: (key: string) => {
      held.delete(key);
    },
    setItem: (key: string, value: string) => {
      held.set(key, value);
    },
  };
}

function client(overrides: Partial<MapleClientOptions> = {}): MapleClient {
  return createMapleClient({
    branch: "feat/x",
    basePath: MAPLE_BASE,
    storage: memoryStorage(),
    debounceMs: 0,
    ...overrides,
  });
}

function route(options: MapleFakeOptions): void {
  fake = createMapleFake(options);
  server.use(...fake.handlers);
}

beforeEach(() => {
  route({ approvals: true });
});

describe("what the client learns about approving", () => {
  it("offers nothing where the store keeps no approvals", async () => {
    route({ approvals: false });
    const maple = client();
    await maple.load();

    expect(maple.getState().approval).toEqual({ supported: false, required: false });
    expect(maple.getState().approvals).toEqual([]);
  });

  it("offers it where the store does, even with nobody insisting", async () => {
    const maple = client();
    await maple.load();

    expect(maple.getState().approval).toEqual({ supported: true, required: false });
  });

  it("carries through that the gate is waiting for one", async () => {
    route({ approvals: true, requireApproval: true });
    const maple = client();
    await maple.load();

    expect(maple.getState().approval).toEqual({ supported: true, required: true });
  });

  it("treats an unreadable approval list as nothing to offer, not a failed load", async () => {
    route({ approvals: true });
    server.use(http.get(`${MAPLE_BASE}/approvals`, () => HttpResponse.json({}, { status: 500 })));
    const maple = client();
    await maple.load();

    expect(maple.getState().phase).toBe("ready");
    expect(maple.getState().approval).toEqual({ supported: false, required: false });
  });
});

describe("approving", () => {
  it("records one and finds it as this reviewer's own", async () => {
    const maple = client();
    await maple.load();
    await maple.approve();

    expect(maple.getState().approvals).toHaveLength(1);
    expect(maple.getState().myApproval).toMatchObject({ author: { id: "u_7" } });
  });

  it("carries the note through to the store", async () => {
    const maple = client();
    await maple.load();
    await maple.approve("Checked at 375px.");

    expect(fake.approvals()[0]?.note).toBe("Checked at 375px.");
  });

  it("takes its own back and nothing else", async () => {
    const maple = client();
    await maple.load();
    await maple.approve();
    await maple.unapprove();

    expect(maple.getState().approvals).toEqual([]);
    expect(maple.getState().myApproval).toBeNull();
  });

  it("does not read somebody else's approval as this reviewer's", async () => {
    const maple = client();
    await maple.load();
    await maple.approve();

    server.use(http.get(`${MAPLE_BASE}/me`, () => HttpResponse.json({ user: null })));
    await maple.load();

    expect(maple.getState().approvals).toHaveLength(1);
    expect(maple.getState().myApproval).toBeNull();
  });

  it("surfaces a refusal as something the overlay can act on", async () => {
    server.use(
      http.post(`${MAPLE_BASE}/approvals`, () =>
        HttpResponse.json({ error: "Sign in first" }, { status: 401 }),
      ),
    );
    const maple = client();
    await maple.load();

    await expect(maple.approve()).rejects.toThrow();
    expect(maple.getState().error).toMatchObject({ during: "approve", kind: "unauthorized" });
  });

  it("does nothing on a withdrawal with nothing to withdraw", async () => {
    const maple = client();
    await maple.load();
    await expect(maple.unapprove()).resolves.toBeUndefined();
  });
});
