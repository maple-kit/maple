import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { sealSession, SESSION_COOKIE } from "../src/auth/cookie.js";
import { createLogger, memorySink } from "../src/logger/index.js";
import { mirrord } from "../src/preview/index.js";
import { createMapleHandler } from "../src/route/index.js";
import { createCommentStore } from "../src/store.js";
import { SAMPLE_CONTEXT } from "../src/testing/fixtures.js";
import { memoryStore } from "../src/testing/memory-store.js";
import { createPullsFake } from "./msw/github-pulls.js";
import { createTestServer, useTestServer } from "./msw/server.js";

import type { IdentityRequest, MediaConnector, PreviewInfo } from "../src/connectors/types.js";
import type { RouteOptions } from "../src/route/index.js";
import type { FakePull } from "./msw/github-pulls.js";

const ORIGIN = "https://preview.example.com";
const SECRET = "s".repeat(40);
const SHA = "a1b2c3d4e5f6a1b2c3d4";
const AUTH = { clientId: "Iv1.test", secret: SECRET, insecure: true };

const github = createPullsFake();
const server = createTestServer(...github.handlers);
useTestServer(server, { beforeAll, afterEach, afterAll });
afterEach(() => github.reset());

const pull = (number: number, head: string, overrides: Partial<FakePull> = {}): FakePull => ({
  number,
  head,
  sha: SHA,
  state: "open",
  ...overrides,
});

function handler(options: Partial<RouteOptions> = {}, env: Record<string, string> = {}) {
  return createMapleHandler({
    preview: mirrord({ env: { MAPLE_PREVIEW_KEY: "feat-login", ...env } }),
    github: { owner: "maple-kit", repo: "app" },
    githubAuth: AUTH,
    ...options,
  });
}

async function cookie(): Promise<string> {
  const sealed = await sealSession({ token: "ghu_reviewer" }, AUTH);
  return `${SESSION_COOKIE}=${encodeURIComponent(sealed)}`;
}

async function get(
  handle: (request: Request) => Promise<Response>,
  path: string,
  signedIn = true,
  basePath = "/api/maple",
): Promise<Response> {
  const headers: Record<string, string> = signedIn ? { cookie: await cookie() } : {};
  return handle(new Request(`${ORIGIN}${basePath}${path}`, { headers }));
}

describe("a deployment that is not a preview", () => {
  const bare = createMapleHandler({
    preview: mirrord(),
    store: createCommentStore(memoryStore()),
    githubAuth: AUTH,
  });

  it.each(["/context", "/me", "/comments?branch=x", "/auth/github", "/media/k", "/nonsense"])(
    "answers 404 on %s",
    async (path) => {
      expect((await get(bare, path)).status).toBe(404);
    },
  );
});

describe("GET /context", () => {
  it("resolves the stated pull request first, and reports its head branch", async () => {
    github.add(pull(7, "feat/login-form"), pull(8, "feat-login"));
    const handle = handler({}, { MAPLE_PULL_REQUEST: "7", MAPLE_COMMIT: SHA });

    const response = await get(handle, "/context");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      preview: "mirrord",
      key: "feat-login",
      branch: "feat/login-form",
      label: "feat-login",
      commit: SHA.slice(0, 20),
      pullRequest: 7,
      pullRequestUrl: "https://github.com/maple-kit/app/pull/7",
      resolved: true,
      reason: null,
    });
  });

  it("falls to the commit when the stated pull request is closed", async () => {
    github.add(pull(7, "feat/old", { state: "closed", sha: "f".repeat(20) }), pull(9, "feat/new"));
    const handle = handler({}, { MAPLE_PULL_REQUEST: "7", MAPLE_COMMIT: SHA });

    expect(await (await get(handle, "/context")).json()).toMatchObject({
      pullRequest: 9,
      pullRequestUrl: "https://github.com/maple-kit/app/pull/9",
      branch: "feat/new",
    });
  });

  it.each([404, 422])(
    "falls to the head branch when GitHub answers %i for the commit",
    async (status) => {
      github.add(pull(5, "feat-login", { sha: "c".repeat(20) }));
      github.failCommits(status);
      const handle = handler({}, { MAPLE_COMMIT: SHA });

      expect(await (await get(handle, "/context")).json()).toMatchObject({
        pullRequest: 5,
        resolved: true,
      });
    },
  );

  it("answers no-access, not 500, for any other 4xx GitHub gives", async () => {
    github.failCommits(410);
    const response = await get(handler({}, { MAPLE_COMMIT: SHA }), "/context");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ resolved: false, reason: "no-access" });
  });

  it("ignores a merged or closed pull request that contains the same commit", async () => {
    github.add(pull(3, "feat/base", { state: "closed" }), pull(9, "feat/new"));
    const handle = handler({}, { MAPLE_COMMIT: SHA });

    expect(await (await get(handle, "/context")).json()).toMatchObject({ pullRequest: 9 });
  });

  it("is ambiguous when two open pull requests contain the commit (a stack)", async () => {
    github.add(pull(8, "feat/base"), pull(9, "feat/top"));
    const handle = handler({}, { MAPLE_COMMIT: SHA });

    expect(await (await get(handle, "/context")).json()).toMatchObject({
      resolved: false,
      reason: "ambiguous",
    });
  });

  it("falls to the commit when the stated pull request does not exist", async () => {
    github.add(pull(9, "feat/new"));
    const handle = handler({}, { MAPLE_PULL_REQUEST: "404", MAPLE_COMMIT: SHA });

    expect(await (await get(handle, "/context")).json()).toMatchObject({ pullRequest: 9 });
  });

  it("uses the commit when only the commit is stated", async () => {
    github.add(pull(9, "feat/new"));
    const handle = handler({}, { MAPLE_COMMIT: SHA });

    expect(await (await get(handle, "/context")).json()).toMatchObject({
      pullRequest: 9,
      resolved: true,
    });
  });

  it("uses the head branch named exactly the key when nothing is stated", async () => {
    github.add(pull(5, "feat-login", { sha: "c".repeat(20) }), pull(6, "feat-login-2"));
    const handle = handler();

    expect(await (await get(handle, "/context")).json()).toMatchObject({
      pullRequest: 5,
      branch: "feat-login",
      resolved: true,
    });
  });

  it("asks the preview's matches hook last, and finds a head by its slug", async () => {
    github.add(pull(5, "Feat/Login", { sha: "c".repeat(20) }), pull(6, "other"));
    const handle = handler();

    expect(await (await get(handle, "/context")).json()).toMatchObject({
      pullRequest: 5,
      branch: "Feat/Login",
    });
  });

  it("reports a key with no pull request as unresolved, not as an error", async () => {
    github.add(pull(6, "other"));

    expect(await (await get(handler(), "/context")).json()).toMatchObject({
      branch: "feat-login",
      pullRequest: null,
      resolved: false,
      reason: "none",
    });
  });

  it("says what is knowable without a token, and asks nothing of GitHub", async () => {
    const handle = handler({}, { MAPLE_PULL_REQUEST: "7", MAPLE_COMMIT: SHA });

    const response = await get(handle, "/context", false);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      preview: "mirrord",
      key: "feat-login",
      branch: "feat-login",
      label: "feat-login",
      commit: SHA,
      pullRequest: 7,
      pullRequestUrl: "https://github.com/maple-kit/app/pull/7",
      resolved: false,
      reason: "sign-in",
    });
  });

  it.each([
    ["MAPLE_BRANCH", { MAPLE_BRANCH: "feat/stated" }],
    ["MAPLE_REF", { MAPLE_REF: "refs/heads/feat/stated" }],
  ])("signed out, reports the branch %s states rather than the key", async (_name, env) => {
    const body = await (await get(handler({}, env), "/context", false)).json();

    expect(body).toMatchObject({ key: "feat-login", branch: "feat/stated", resolved: false });
  });

  it("hands a callback the stated branch before a pull request is found", async () => {
    const seen: (PreviewInfo | undefined)[] = [];
    const store = (request: IdentityRequest) => {
      seen.push(request.preview);
      return createCommentStore(memoryStore());
    };
    const handle = handler({ store }, { MAPLE_BRANCH: "feat/stated" });

    await get(handle, "/comments?branch=x");
    expect(seen).toEqual([{ key: "feat-login", label: "feat-login", branch: "feat/stated" }]);
  });

  it("reports several matching heads as ambiguous rather than choosing one", async () => {
    github.add(pull(5, "Feat/Login", { sha: "c".repeat(20) }), pull(6, "feat_login"));

    const body = await (await get(handler(), "/context")).json();
    expect(body).toMatchObject({
      pullRequest: null,
      pullRequestUrl: null,
      resolved: false,
      reason: "ambiguous",
    });
  });

  it("does not echo a stated pull request that GitHub found closed", async () => {
    github.add(pull(7, "feat/old", { state: "closed", sha: "f".repeat(20) }));
    const handle = handler({}, { MAPLE_PULL_REQUEST: "7" });

    expect(await (await get(handle, "/context")).json()).toMatchObject({
      pullRequest: null,
      pullRequestUrl: null,
      resolved: false,
      reason: "none",
    });
  });

  it("does not echo a stated pull request when the lookup is ambiguous", async () => {
    github.add(pull(5, "Feat/Login", { sha: "c".repeat(20) }), pull(6, "feat_login"));
    const handle = handler({}, { MAPLE_PULL_REQUEST: "7" });

    expect(await (await get(handle, "/context")).json()).toMatchObject({
      pullRequest: null,
      pullRequestUrl: null,
      reason: "ambiguous",
    });
  });

  it("keeps echoing the stated number while it may still be the answer", async () => {
    github.fail(403);
    const handle = handler({}, { MAPLE_PULL_REQUEST: "7" });

    expect(await (await get(handle, "/context")).json()).toMatchObject({
      pullRequest: 7,
      reason: "no-access",
    });
  });

  it("uses MAPLE_BRANCH, exact, after the stated pull request and before the commit", async () => {
    github.add(pull(5, "feat/exact", { sha: "c".repeat(20) }), pull(9, "feat/new"));
    const handle = handler({}, { MAPLE_BRANCH: "feat/exact", MAPLE_COMMIT: SHA });

    expect(await (await get(handle, "/context")).json()).toMatchObject({
      pullRequest: 5,
      branch: "feat/exact",
      resolved: true,
    });
  });

  it("lets a stated open pull request beat MAPLE_BRANCH", async () => {
    github.add(pull(5, "feat/exact"), pull(8, "feat/other"));
    const handle = handler({}, { MAPLE_REF: "refs/pull/8/merge", MAPLE_BRANCH: "feat/exact" });

    expect(await (await get(handle, "/context")).json()).toMatchObject({ pullRequest: 8 });
  });

  it("falls past a MAPLE_BRANCH with no open pull request", async () => {
    github.add(pull(5, "feat/exact", { state: "closed" }), pull(9, "feat/new"));
    const handle = handler({}, { MAPLE_BRANCH: "feat/exact", MAPLE_COMMIT: SHA });

    expect(await (await get(handle, "/context")).json()).toMatchObject({ pullRequest: 9 });
  });

  it("finds a ticket-prefix key through the preset's matches option", async () => {
    github.add(pull(5, "eng-884-remove-flag", { sha: "c".repeat(20) }), pull(6, "eng-90-other"));
    const handle = handler({
      preview: mirrord({
        env: { MAPLE_PREVIEW_KEY: "ENG-884" },
        matches: (head, identity) => head.startsWith(`${identity.key.toLowerCase()}-`),
      }),
    });

    expect(await (await get(handle, "/context")).json()).toMatchObject({
      pullRequest: 5,
      branch: "eng-884-remove-flag",
    });
  });

  it("has no pull request address without a github option, even with a stated number", async () => {
    const handle = createMapleHandler({
      preview: mirrord({ env: { MAPLE_PREVIEW_KEY: "feat-login", MAPLE_PULL_REQUEST: "7" } }),
      githubAuth: AUTH,
    });

    expect(await (await get(handle, "/context")).json()).toMatchObject({
      pullRequest: 7,
      pullRequestUrl: null,
      reason: "unconfigured",
    });
  });

  it("answers 502 when GitHub answers with a server error", async () => {
    github.fail(503);

    const response = await get(handler(), "/context");
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "GitHub could not be reached",
      reason: "unavailable",
    });
  });

  it("reports a repository the reviewer cannot see, when GitHub answers 404", async () => {
    github.fail(404);

    const response = await get(handler(), "/context");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ resolved: false, reason: "no-access" });
  });

  it("answers 405 to a write", async () => {
    const response = await handler()(
      new Request(`${ORIGIN}/api/maple/context`, { method: "POST" }),
    );
    expect(response.status).toBe(405);
  });

  it("is served at a custom basePath", async () => {
    github.add(pull(5, "feat-login"));
    const handle = handler({ basePath: "/maple" });

    expect((await get(handle, "/context", true, "/maple")).status).toBe(200);
    expect((await get(handle, "/context")).status).toBe(404);
  });
});

describe("what one request costs GitHub", () => {
  const lookups = () => github.reads().filter((read) => !read.endsWith("/comments")).length;

  it("asks once for a request that resolves to nothing, and not again within the TTL", async () => {
    const handle = handler();
    const first = await get(handle, "/comments?branch=x");
    expect(first.status).toBe(200);
    const cost = lookups();
    expect(cost).toBeGreaterThan(0);

    await get(handle, "/comments?branch=x");
    await get(handle, "/context");
    expect(lookups()).toBe(cost);
  });

  it("does not repeat an ambiguous answer for the store and the reading", async () => {
    github.add(pull(5, "Feat/Login", { sha: "c".repeat(20) }), pull(6, "feat_login"));
    const handle = handler();

    expect((await get(handle, "/comments?branch=x")).status).toBe(409);
    const cost = lookups();
    expect((await get(handle, "/comments?branch=x")).status).toBe(409);
    expect(lookups()).toBe(cost);
  });

  it("does not repeat a 403 within the TTL", async () => {
    github.fail(403);
    const handle = handler();
    await get(handle, "/context");
    const cost = lookups();
    await get(handle, "/context");
    expect(lookups()).toBe(cost);
  });
});

describe("writing comments to the preview's pull request", () => {
  const draft = {
    branch: "feat-login",
    body: "The gap is wrong.",
    anchor: { component: "Header", selector: "main > h1" },
    context: SAMPLE_CONTEXT,
  };

  async function post(handle: (request: Request) => Promise<Response>): Promise<Response> {
    return handle(
      new Request(`${ORIGIN}/api/maple/comments`, {
        method: "POST",
        body: JSON.stringify(draft),
        headers: { cookie: await cookie(), "content-type": "application/json" },
      }),
    );
  }

  it("writes to the resolved pull request under the reviewer's token", async () => {
    github.add(pull(5, "feat-login"));

    expect((await post(handler())).status).toBe(201);
    expect(github.writes()).toEqual(["POST /issues/5/comments"]);
  });

  it("answers 409 and writes nothing when several pull requests match", async () => {
    github.add(pull(5, "Feat/Login", { sha: "c".repeat(20) }), pull(6, "feat_login"));

    const response = await post(handler());
    expect(response.status).toBe(409);
    expect(github.writes()).toEqual([]);
  });

  it("answers 401 when the reviewer has not linked GitHub", async () => {
    const response = await handler()(
      new Request(`${ORIGIN}/api/maple/comments`, {
        method: "POST",
        body: JSON.stringify(draft),
      }),
    );
    expect(response.status).toBe(401);
  });

  it("does not hide a GitHub outage behind a 409", async () => {
    github.fail(500);

    const response = await post(handler());
    expect(response.status).toBe(503);
    expect(github.writes()).toEqual([]);
  });
});

describe("github.media", () => {
  it("reaches the store, so a comment's screenshot links through the host's media route", async () => {
    github.add(pull(5, "feat-login"));
    const asked: string[] = [];
    const media: MediaConnector = {
      name: "host",
      putBlob: () => Promise.reject(new Error("not used")),
      getUrl: (ref) => {
        asked.push(ref.key);
        return Promise.resolve(`https://preview.example.com/api/maple/media/${ref.key}`);
      },
    };
    const handle = handler({ github: { owner: "maple-kit", repo: "app", media } });
    const shot = { connector: "host", key: "k1", contentType: "image/png" };

    const response = await handle(
      new Request(`${ORIGIN}/api/maple/comments`, {
        method: "POST",
        body: JSON.stringify({
          branch: "feat-login",
          body: "The gap is wrong.",
          anchor: { component: "Header", selector: "main > h1" },
          context: SAMPLE_CONTEXT,
          attachments: [shot],
        }),
        headers: { cookie: await cookie(), "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(201);
    expect(asked).toEqual(["k1"]);
  });
});

describe("where identity comes from", () => {
  const warnings = (sink: ReturnType<typeof memorySink>) =>
    sink.records.filter((record) => record.level === "warn");

  function logged(env: Record<string, string>) {
    const sink = memorySink();
    const logger = createLogger({ sinks: [sink] });
    const handle = createMapleHandler({
      preview: mirrord({ env }),
      github: { owner: "maple-kit", repo: "app" },
      githubAuth: AUTH,
      logger,
    });
    return { sink, handle };
  }

  it("warns once when a request, not the env, names the key, and says what to run", async () => {
    const { sink, handle } = logged({});
    const request = () =>
      new Request(`${ORIGIN}/api/maple/context`, { headers: { "mirrord-key": "k" } });

    await handle(request());
    await handle(request());
    await handle(
      new Request(`${ORIGIN}/api/maple/context`, { headers: { baggage: "mirrord-session=j" } }),
    );

    expect(warnings(sink)).toHaveLength(1);
    expect(warnings(sink)[0]?.message).toMatch(/MAPLE_PREVIEW_KEY is not set/);
    expect(warnings(sink)[0]?.message).toMatch(/maple setup preview mirrord/);
  });

  it("warns at the first request even when it carries no key at all, then stays quiet", async () => {
    const { sink, handle } = logged({});

    expect((await handle(new Request(`${ORIGIN}/api/maple/context`))).status).toBe(404);
    await handle(new Request(`${ORIGIN}/api/maple/context`));
    expect(warnings(sink)).toHaveLength(1);
  });

  it("does not warn when the env names the key", async () => {
    const { sink, handle } = logged({ MAPLE_PREVIEW_KEY: "k" });

    await handle(new Request(`${ORIGIN}/api/maple/context`, { headers: { "mirrord-key": "j" } }));
    expect(warnings(sink)).toEqual([]);
  });

  it("warns once about a request-borne identity from a preview with no env key to check", async () => {
    const sink = memorySink();
    const handle = createMapleHandler({
      preview: {
        name: "custom",
        identify: () => Promise.resolve({ key: "k", source: "header" }),
      },
      logger: createLogger({ sinks: [sink] }),
      githubAuth: AUTH,
    });

    await handle(new Request(`${ORIGIN}/api/maple/context`));
    await handle(new Request(`${ORIGIN}/api/maple/context`));
    expect(warnings(sink)).toHaveLength(1);
    expect(warnings(sink)[0]?.message).toMatch(/request's header/);
  });
});

describe("what a per-request callback is handed", () => {
  it("is the resolved session, so the host never re-reads a header", async () => {
    github.add(pull(7, "feat/login-form"));
    const seen: (PreviewInfo | undefined)[] = [];
    const store = (request: IdentityRequest) => {
      seen.push(request.preview);
      return createCommentStore(memoryStore());
    };
    const media = (request: IdentityRequest) => {
      seen.push(request.preview);
      return null;
    };
    const handle = handler({ store, media }, { MAPLE_PULL_REQUEST: "7" });

    await get(handle, "/comments?branch=x");
    await get(handle, "/media/k");
    const resolved = {
      key: "feat-login",
      label: "feat-login",
      branch: "feat/login-form",
      pullRequest: 7,
    };
    expect(seen).toEqual([resolved, resolved]);
  });

  it("leaves out a stated pull request that GitHub found closed", async () => {
    github.add(pull(7, "feat/old", { state: "closed", sha: "f".repeat(20) }));
    const seen: (PreviewInfo | undefined)[] = [];
    const store = (request: IdentityRequest) => {
      seen.push(request.preview);
      return createCommentStore(memoryStore());
    };
    const handle = handler({ store }, { MAPLE_PULL_REQUEST: "7" });

    await get(handle, "/comments?branch=x");
    expect(seen).toEqual([{ key: "feat-login", label: "feat-login", branch: "feat-login" }]);
  });

  it("is absent when the handler has no preview", async () => {
    let seen: unknown = "unset";
    const handle = createMapleHandler({
      store: (request) => {
        seen = request.preview;
        return createCommentStore(memoryStore());
      },
    });

    await handle(new Request(`${ORIGIN}/api/maple/comments?branch=x`));
    expect(seen).toBeUndefined();
  });
});

describe("the session cookie's path", () => {
  async function pathFor(options: Partial<RouteOptions>): Promise<string | undefined> {
    const handle = createMapleHandler({
      store: createCommentStore(memoryStore()),
      githubAuth: AUTH,
      ...options,
    });
    const response = await handle(
      new Request(`${ORIGIN}${options.basePath ?? "/api/maple"}/auth/github`, { method: "DELETE" }),
    );
    return response.headers.getSetCookie()[0]?.match(/Path=([^;]+)/)?.[1];
  }

  it("follows a custom basePath", async () => {
    expect(await pathFor({ basePath: "/maple" })).toBe("/maple");
  });

  it("defaults to the default mount", async () => {
    expect(await pathFor({})).toBe("/api/maple");
  });

  it("keeps a path the host set", async () => {
    expect(await pathFor({ basePath: "/maple", githubAuth: { ...AUTH, path: "/" } })).toBe("/");
  });
});
