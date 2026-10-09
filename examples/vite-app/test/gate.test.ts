import { generateKeyPairSync } from "node:crypto";

import { createLogger, memorySink } from "@maple-kit/core/logger";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { gateFrom } from "../worker/gate.js";

import type { GateEnv } from "../worker/gate.js";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const FULL: GateEnv = {
  MAPLE_REPO: "maple-kit/maple",
  MAPLE_GATE_APP_ID: "1234567",
  MAPLE_GATE_INSTALLATION_ID: "7654321",
  MAPLE_GATE_PRIVATE_KEY: privateKey,
};

const API = "https://api.github.com";
const REQUEST = { headers: {}, url: "https://preview.example/api/maple/comments" };
const posted: unknown[] = [];

const server = setupServer(
  http.post(`${API}/app/installations/7654321/access_tokens`, () =>
    HttpResponse.json({ token: "ghs_installation_1" }, { status: 201 }),
  ),
  http.get(`${API}/repos/maple-kit/maple/commits/abc/check-runs`, () =>
    HttpResponse.json({ check_runs: [] }),
  ),
  http.post(`${API}/repos/maple-kit/maple/check-runs`, async ({ request }) => {
    posted.push({ auth: request.headers.get("authorization"), body: await request.json() });
    return HttpResponse.json({ id: 1 }, { status: 201 });
  }),
);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});
afterEach(() => {
  server.resetHandlers();
  posted.length = 0;
});
afterAll(() => {
  server.close();
});

describe("the preview Worker's gate", () => {
  it.each([
    ["no gate bindings", { MAPLE_REPO: "maple-kit/maple" }],
    ["no app id", { ...FULL, MAPLE_GATE_APP_ID: undefined }],
    ["an empty app id", { ...FULL, MAPLE_GATE_APP_ID: "" }],
    ["no installation id", { ...FULL, MAPLE_GATE_INSTALLATION_ID: undefined }],
    ["no private key", { ...FULL, MAPLE_GATE_PRIVATE_KEY: undefined }],
  ])("is absent with %s", (_name, env) => {
    expect(gateFrom(env)).toBeUndefined();
  });

  it("publishes as the App's installation when all three are set", async () => {
    const resolve = gateFrom(FULL);
    expect(resolve).toBeDefined();

    const gate = await resolve?.(REQUEST);
    await gate?.publish({
      branch: "web-1",
      sha: "abc",
      verdict: {
        conclusion: "clear",
        reason: "no-comments",
        title: "t",
        summary: "s",
        open: 0,
        total: 0,
      },
    });

    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      auth: "Bearer ghs_installation_1",
      body: { name: "maple/visual-review", head_sha: "abc", conclusion: "success" },
    });
  });

  it("answers null, and logs, for an App GitHub will not mint for", async () => {
    server.use(
      http.post(`${API}/app/installations/7654321/access_tokens`, () =>
        HttpResponse.json({ message: "Bad credentials" }, { status: 401 }),
      ),
    );

    const sink = memorySink();
    const logger = createLogger({ sinks: [sink] });

    expect(await gateFrom(FULL, logger)?.(REQUEST)).toBeNull();
    expect(sink.records.map((record) => record.level)).toEqual(["error"]);
  });
});
