import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createMapleClient } from "../src/client/index.js";
import { storedComment } from "../src/testing/fixtures.js";
import { MAPLE_BASE } from "./msw/maple.js";
import { createTestServer, useTestServer } from "./msw/server.js";

import type { MapleClient } from "../src/client/index.js";

const server = createTestServer();
useTestServer(server, { beforeAll, afterEach, afterAll });

function client(): MapleClient {
  return createMapleClient({ branch: "feat/x", basePath: MAPLE_BASE, debounceMs: 0 });
}

/** A deployment that refuses the list until the reviewer's link has completed. */
function gated(): void {
  let linked = false;
  server.use(
    http.get(`${MAPLE_BASE}/comments`, () =>
      linked
        ? HttpResponse.json({ comments: [storedComment({ id: "c_1" })] })
        : HttpResponse.json({ error: "Sign in" }, { status: 401 }),
    ),
    http.get(`${MAPLE_BASE}/me`, () => HttpResponse.json({ user: null, github: { linked } })),
    http.post(`${MAPLE_BASE}/auth/github`, () =>
      HttpResponse.json({
        userCode: "WDJB-MJHT",
        verificationUri: "https://github.com/login/device",
        expiresAt: Date.now() + 60_000,
        interval: 0,
      }),
    ),
    http.patch(`${MAPLE_BASE}/auth/github`, () => {
      linked = true;
      return HttpResponse.json({ status: "linked", login: "dana" });
    }),
  );
}

describe("signing in from the island", () => {
  it("clears the failure and reads the comments again once the link completes", async () => {
    gated();
    const maple = client();
    await maple.load();
    expect(maple.getState().error).toMatchObject({ kind: "unauthorized", during: "load" });

    await maple.linkGitHub();
    await expect.poll(() => maple.getState().comments.length).toBe(1);

    expect(maple.getState()).toMatchObject({ phase: "ready", error: null });
    expect(maple.getState().github).toMatchObject({ state: "linked" });
    maple.destroy();
  });
});

describe("calls in flight", () => {
  it("counts a store call while it is out and returns to zero after, failed or not", async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((done) => (release = done));
    server.use(
      http.get(`${MAPLE_BASE}/comments`, async () => {
        await held;
        return HttpResponse.json({ comments: [] });
      }),
      http.get(`${MAPLE_BASE}/me`, () => HttpResponse.json({ user: null })),
    );
    const maple = client();

    const loading = maple.load();
    expect(maple.getState().pending).toBe(1);
    release();
    await loading;
    expect(maple.getState().pending).toBe(0);

    server.use(http.get(`${MAPLE_BASE}/comments`, () => HttpResponse.error()));
    await maple.load();
    expect(maple.getState().pending).toBe(0);
    maple.destroy();
  });

  it("counts a status change", async () => {
    server.use(
      http.patch(`${MAPLE_BASE}/comments/:id`, async () => {
        await new Promise((done) => setTimeout(done, 20));
        return HttpResponse.json(storedComment({ id: "c_1", status: "resolved" }));
      }),
    );
    const maple = client();

    const changing = maple.setStatus("c_1", "resolved");
    expect(maple.getState().pending).toBe(1);
    await changing;
    expect(maple.getState().pending).toBe(0);
    maple.destroy();
  });
});
