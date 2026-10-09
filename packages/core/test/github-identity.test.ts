import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { githubIdentity } from "../src/auth/index.js";
import { createMapleHandler } from "../src/route/index.js";
import { createCommentStore } from "../src/store.js";
import { memoryStore } from "../src/testing/memory-store.js";
import { createDeviceFlowFake } from "./msw/github.js";
import { createTestServer, useTestServer } from "./msw/server.js";

const BASE = "https://preview.example.com";
const github = createDeviceFlowFake();
const server = createTestServer(...github.handlers);

useTestServer(server, { beforeAll, afterEach, afterAll });

function handler() {
  return createMapleHandler({
    store: createCommentStore(memoryStore()),
    identity: githubIdentity(),
    githubAuth: { clientId: "Iv1.test", insecure: true },
  });
}

/** Signs in through the route and returns the session cookie a browser would send. */
async function signIn(handle: (request: Request) => Promise<Response>): Promise<string> {
  const started = await handle(new Request(`${BASE}/api/maple/auth/github`, { method: "POST" }));
  const pending = pair(started, "maple_gh_pending");
  github.respond({ token: "ghu_reviewer" });
  const linked = await handle(
    new Request(`${BASE}/api/maple/auth/github`, { method: "PATCH", headers: { cookie: pending } }),
  );
  return pair(linked, "maple_gh");
}

function pair(response: Response, name: string): string {
  const header = response.headers.getSetCookie().find((one) => one.startsWith(`${name}=`));
  return header?.split(";")[0] ?? "";
}

async function me(handle: (request: Request) => Promise<Response>, cookie: string) {
  const response = await handle(new Request(`${BASE}/api/maple/me`, { headers: { cookie } }));
  return (await response.json()) as {
    user: { id: string; name: string; avatarUrl?: string } | null;
  };
}

describe("githubIdentity", () => {
  it("names the reviewer by the login they signed in with", async () => {
    github.whoami("octocat");
    const handle = handler();
    const cookie = await signIn(handle);

    const { user } = await me(handle, cookie);
    expect(user).toEqual({
      id: "octocat",
      name: "octocat",
      avatarUrl: "https://github.com/octocat.png",
    });

    const posted = await handle(
      new Request(`${BASE}/api/maple/comments`, {
        method: "POST",
        headers: { cookie },
        body: JSON.stringify({ branch: "b", body: "hi", anchor: { kind: "page" } }),
      }),
    );
    const comment = (await posted.json()) as { author: { name: string; provenance: string } };
    expect(comment.author.name).toBe("octocat");
    expect(comment.author.provenance).not.toBe("guest");
  });

  it("leaves a session whose login could not be read a guest", async () => {
    github.whoami(null);
    const handle = handler();
    const cookie = await signIn(handle);

    expect((await me(handle, cookie)).user).toBeNull();
  });

  it("leaves a request with no session a guest", async () => {
    expect((await me(handler(), "")).user).toBeNull();
  });
});
