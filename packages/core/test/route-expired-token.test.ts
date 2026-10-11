import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { githubStore } from "../src/connectors/github.js";
import { createMapleHandler } from "../src/route/index.js";
import { createCommentStore } from "../src/store.js";
import { createTestServer, useTestServer } from "./msw/server.js";

import type { IdentityConnector } from "../src/connectors/types.js";

const API = "https://api.github.com";
const BASE = "https://preview.example.com/api/maple";
const SECRET = "expired-token-test-secret-at-least-32-bytes-long";
const server = createTestServer();

useTestServer(server, { beforeAll, afterEach, afterAll });

const reviewer: IdentityConnector = {
  name: "test-identity",
  resolveUser: () => Promise.resolve({ id: "u_7", name: "Dana" }),
};

function handler(withAuth = true) {
  const store = createCommentStore(
    githubStore({ owner: "maple-kit", repo: "app", token: "ghu_expired" }),
  );
  return createMapleHandler({
    store,
    identity: reviewer,
    ...(withAuth ? { githubAuth: { clientId: "Iv1.test", secret: SECRET } } : {}),
  });
}

function answer(status: number, message: string) {
  server.use(http.all(`${API}/*`, () => HttpResponse.json({ message }, { status })));
}

const comment = {
  branch: "feat/x",
  body: "Spacing",
  anchor: { component: "Card" },
};

const calls: ReadonlyArray<[string, string, string, unknown]> = [
  ["lists comments", "GET", "/comments?branch=feat/x", undefined],
  ["posts a comment", "POST", "/comments", comment],
  ["changes a comment", "PATCH", "/comments/gh_1_2", { status: "resolved" }],
  ["approves", "POST", "/approvals", { branch: "feat/x" }],
];

function send(method: string, path: string, body?: unknown): Request {
  return new Request(`${BASE}${path}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("when GitHub rejects the reviewer's token", () => {
  it.each(calls)(
    "%s: answers 401 and clears the session cookie",
    async (_name, method, path, body) => {
      answer(401, "Bad credentials");

      const response = await handler()(send(method, path, body));
      const text = JSON.stringify(await response.json());

      expect(response.status).toBe(401);
      expect(text).toMatch(/sign in again/i);
      expect(text).not.toContain("ghu_expired");
      const cleared = response.headers.getSetCookie().find((one) => one.startsWith("maple_gh="));
      expect(cleared).toMatch(/Max-Age=0/);
    },
  );

  it("keeps the old refusal where no GitHub sign-in is configured", async () => {
    answer(401, "Bad credentials");

    const response = await handler(false)(send("GET", "/comments?branch=feat/x"));

    expect(response.status).toBe(502);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("leaves other refusals as they were, with the cookie alone", async () => {
    answer(422, "Validation Failed");

    const response = await handler()(send("GET", "/comments?branch=feat/x"));

    expect(response.status).toBe(400);
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});
