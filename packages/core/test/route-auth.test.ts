import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { readGitHubSession, SESSION_COOKIE } from "../src/auth/index.js";
import { createMapleHandler } from "../src/route/index.js";
import { createCommentStore } from "../src/store.js";
import { memoryStore } from "../src/testing/memory-store.js";
import { createDeviceFlowFake } from "./msw/github.js";
import { createTestServer, useTestServer } from "./msw/server.js";

import type { GitHubAuthOptions } from "../src/route/index.js";

const BASE = "https://preview.example.com";
const github = createDeviceFlowFake();
const server = createTestServer(...github.handlers);

useTestServer(server, { beforeAll, afterEach, afterAll });

/** The fake keeps its login across tests; a leftover null is not a finding. */
beforeEach(() => {
  github.whoami("octocat");
});

/** A test value; nothing protects anything here. */
const SECRET = "s".repeat(40);
const OTHER = "o".repeat(40);
const OPTIONS = { secret: SECRET, insecure: true };

function handler(auth: Partial<GitHubAuthOptions> = {}) {
  return createMapleHandler({
    store: createCommentStore(memoryStore()),
    githubAuth: { clientId: "Iv1.test", ...OPTIONS, ...auth },
  });
}

function request(method: string, path: string, cookie?: string): Request {
  return new Request(`${BASE}${path}`, {
    method,
    ...(cookie === undefined ? {} : { headers: { cookie } }),
  });
}

/** The value of one `Set-Cookie`, as a browser would send it back. */
function cookieFrom(response: Response, name: string): string | undefined {
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(";");
    if (pair?.startsWith(`${name}=`)) return pair;
  }
  return undefined;
}

/** Runs a whole link: start, one pending poll, then the token. */
async function link(auth: Partial<GitHubAuthOptions> = {}): Promise<Response> {
  const handle = handler(auth);
  const started = await handle(request("POST", "/api/maple/auth/github"));
  const pending = cookieFrom(started, "maple_gh_pending")!;

  github.respond("pending", { token: "ghu_reviewer" });
  await handle(request("PATCH", "/api/maple/auth/github", pending));
  return handle(request("PATCH", "/api/maple/auth/github", pending));
}

describe("starting a link", () => {
  it("shows the reviewer a code and a place to type it", async () => {
    const response = await handler()(request("POST", "/api/maple/auth/github"));
    const body = (await response.json()) as { userCode: string; verificationUri: string };

    expect(response.status).toBe(200);
    expect(body.userCode).toBe("WDJB-MJHT");
    expect(body.verificationUri).toBe("https://github.com/login/device");
  });

  it("never sends the device code to the browser in a body", async () => {
    const response = await handler()(request("POST", "/api/maple/auth/github"));
    expect(await response.text()).not.toContain("dev-code-secret");
  });

  it("keeps the device code in an HttpOnly cookie that outlives no more than the code", async () => {
    const response = await handler()(request("POST", "/api/maple/auth/github"));
    const header = response.headers.getSetCookie().find((one) => one.includes("maple_gh_pending"))!;

    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/api/maple");
    expect(Number(/Max-Age=(\d+)/.exec(header)?.[1])).toBeLessThanOrEqual(900);
  });
});

describe("finishing a link", () => {
  it("reports pending while the reviewer has not typed the code yet", async () => {
    const handle = handler();
    const started = await handle(request("POST", "/api/maple/auth/github"));

    github.respond("pending");
    const response = await handle(
      request("PATCH", "/api/maple/auth/github", cookieFrom(started, "maple_gh_pending")),
    );
    const body = (await response.json()) as { status: string; interval: number };

    expect(response.status).toBe(200);
    expect(body.status).toBe("pending");
    expect(body.interval).toBe(5);
  });

  it("sets the session cookie and names the reviewer once they have", async () => {
    github.whoami("octocat");
    const response = await link();
    const body = (await response.json()) as { status: string; login?: string };

    expect(body.status).toBe("linked");
    expect(body.login).toBe("octocat");
    expect(cookieFrom(response, SESSION_COOKIE)).toBeDefined();
  });

  it("forgets the device code the moment it is spent", async () => {
    const response = await link();
    const spent = response.headers.getSetCookie().find((one) => one.includes("maple_gh_pending"))!;

    expect(spent).toContain("Max-Age=0");
  });

  it("never puts the token in the body", async () => {
    const response = await link();
    expect(await response.text()).not.toContain("ghu_reviewer");
  });

  it("links without a name when GitHub will not say who the token belongs to", async () => {
    github.whoami(null);
    const body = (await link().then((one) => one.json())) as { status: string; login?: string };

    expect(body.status).toBe("linked");
    expect(body.login).toBeUndefined();
  });

  it("answers 410 when nothing is in progress, rather than starting one", async () => {
    const response = await handler()(request("PATCH", "/api/maple/auth/github"));
    expect(response.status).toBe(410);
  });

  it("says who refused, when the reviewer refuses", async () => {
    const handle = handler();
    const started = await handle(request("POST", "/api/maple/auth/github"));

    github.respond({ error: "access_denied" });
    const response = await handle(
      request("PATCH", "/api/maple/auth/github", cookieFrom(started, "maple_gh_pending")),
    );
    const body = (await response.json()) as { reason: string };

    expect(response.status).toBe(403);
    expect(body.reason).toBe("denied");
  });

  it("says the App has device flow switched off, which is a 501 and not a refusal", async () => {
    const handle = handler();
    const started = await handle(request("POST", "/api/maple/auth/github"));

    github.respond({ error: "device_flow_disabled" });
    const response = await handle(
      request("PATCH", "/api/maple/auth/github", cookieFrom(started, "maple_gh_pending")),
    );

    expect(response.status).toBe(501);
  });
});

describe("the session cookie", () => {
  it("carries every flag the design leans on", async () => {
    const handle = createMapleHandler({
      store: createCommentStore(memoryStore()),
      githubAuth: { clientId: "Iv1.test", secret: SECRET },
    });
    const started = await handle(request("POST", "/api/maple/auth/github"));

    github.respond({ token: "ghu_reviewer" });
    const response = await handle(
      request("PATCH", "/api/maple/auth/github", cookieFrom(started, "maple_gh_pending")),
    );
    const header = response.headers.getSetCookie().find((one) => one.includes(SESSION_COOKIE))!;

    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/api/maple");
  });

  it("reads back as the token a store resolver would build on", async () => {
    const response = await link();
    const cookie = cookieFrom(response, SESSION_COOKIE)!;

    const session = await readGitHubSession({ headers: { cookie }, url: BASE }, OPTIONS);
    expect(session?.token).toBe("ghu_reviewer");
    expect(session?.login).toBe("octocat");
  });

  it("is sealed: the token is not in the value, and the wrong secret opens nothing", async () => {
    const cookie = cookieFrom(await link(), SESSION_COOKIE)!;
    const request = { headers: { cookie }, url: BASE };

    expect(cookie).not.toContain("ghu_reviewer");
    expect(await readGitHubSession(request, { secret: OTHER })).toBeNull();
    expect((await readGitHubSession(request, OPTIONS))?.token).toBe("ghu_reviewer");
  });

  it("still opens under a retired secret listed after the current one", async () => {
    const cookie = cookieFrom(await link(), SESSION_COOKIE)!;
    const rotated = { secret: [OTHER, SECRET] };

    expect((await readGitHubSession({ headers: { cookie }, url: BASE }, rotated))?.token).toBe(
      "ghu_reviewer",
    );
  });

  it("is signed out when the cookie is the old plain format, written by hand", async () => {
    const plain = btoa(JSON.stringify({ token: "ghu_forged", login: "someone" }));
    const cookie = `${SESSION_COOKIE}=p.${plain.replaceAll("=", "")}`;

    expect(await readGitHubSession({ headers: { cookie }, url: BASE }, OPTIONS)).toBeNull();
  });

  it("is signed out for a tampered value, which never throws", async () => {
    const sealed = cookieFrom(await link(), SESSION_COOKIE)!;
    const flipped = sealed.slice(0, -2) + (sealed.endsWith("AA") ? "BB" : "AA");

    const rows = [
      flipped,
      `${SESSION_COOKIE}=s1.aaaa.bbbb`,
      `${SESSION_COOKIE}=s1`,
      `${SESSION_COOKIE}=%E0%A4%A`,
    ];
    for (const cookie of rows) {
      expect(await readGitHubSession({ headers: { cookie }, url: BASE }, OPTIONS)).toBeNull();
    }
  });

  it("is signed out once its sealed expiry has passed, whatever the browser does", async () => {
    vi.useFakeTimers();
    try {
      const cookie = cookieFrom(await link({ maxAgeSeconds: 60 }), SESSION_COOKIE)!;
      const request = { headers: { cookie }, url: BASE };

      vi.advanceTimersByTime(59_000);
      expect(await readGitHubSession(request, OPTIONS)).not.toBeNull();
      vi.advanceTimersByTime(2000);
      expect(await readGitHubSession(request, OPTIONS)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("cannot be swapped for the pending cookie, which is sealed for another purpose", async () => {
    const started = await handler()(request("POST", "/api/maple/auth/github"));
    const pending = cookieFrom(started, "maple_gh_pending")!.replace(
      "maple_gh_pending",
      SESSION_COOKIE,
    );

    expect(
      await readGitHubSession({ headers: { cookie: pending }, url: BASE }, OPTIONS),
    ).toBeNull();
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["short", "too-short"],
    ["a short one in a list", [SECRET, "short"]],
    ["an empty list", []],
  ])("refuses a %s secret when the route is built", (_, secret) => {
    const build = () =>
      createMapleHandler({
        store: createCommentStore(memoryStore()),
        githubAuth: { clientId: "Iv1.test", secret: secret as string },
      });

    expect(build).toThrow(/session secret/);
  });

  it.each([
    ["first", (pair: string) => `${pair}, maple_gh_pending=p.abc, theme=dark`],
    ["in the middle", (pair: string) => `theme=dark, ${pair}; lang=en`],
    ["last", (pair: string) => `theme=dark, maple_gh_pending=p.abc, ${pair}`],
  ])("reads back when it comes %s of several joined cookie headers", async (_, join) => {
    const response = await link();
    const cookie = join(cookieFrom(response, SESSION_COOKIE)!);

    expect((await readGitHubSession({ headers: { cookie }, url: BASE }, OPTIONS))?.token).toBe(
      "ghu_reviewer",
    );
  });
});

describe("signing out", () => {
  it("clears both cookies, because a half-finished link is also state", async () => {
    const response = await handler()(request("DELETE", "/api/maple/auth/github"));
    const cleared = response.headers.getSetCookie();

    expect(response.status).toBe(200);
    expect(cleared.filter((one) => one.includes("Max-Age=0"))).toHaveLength(2);
  });
});

describe("what /me says about the link", () => {
  it("says nothing at all when the route was given no auth", async () => {
    const handle = createMapleHandler({ store: createCommentStore(memoryStore()) });
    const body = (await handle(request("GET", "/api/maple/me")).then((one) => one.json())) as {
      github?: unknown;
    };

    expect(body.github).toBeUndefined();
  });

  it("says not linked before the reviewer has linked", async () => {
    const body = (await handler()(request("GET", "/api/maple/me")).then((one) => one.json())) as {
      github: { linked: boolean };
    };

    expect(body.github.linked).toBe(false);
  });

  it("names the reviewer once they have, without asking GitHub again", async () => {
    const cookie = cookieFrom(await link(), SESSION_COOKIE)!;

    github.whoami(null);
    const body = (await handler()(request("GET", "/api/maple/me", cookie)).then((one) =>
      one.json(),
    )) as { github: { linked: boolean; login?: string } };

    expect(body.github.linked).toBe(true);
    expect(body.github.login).toBe("octocat");
  });
});

describe("a route with no auth configured", () => {
  it("has no link endpoint at all, rather than one that fails", async () => {
    const handle = createMapleHandler({ store: createCommentStore(memoryStore()) });
    expect((await handle(request("POST", "/api/maple/auth/github"))).status).toBe(404);
  });

  it("answers 405 for a method the link endpoint does not have", async () => {
    expect((await handler()(request("GET", "/api/maple/auth/github"))).status).toBe(405);
  });
});
