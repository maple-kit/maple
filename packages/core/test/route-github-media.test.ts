import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { sealSession } from "../src/auth/cookie.js";
import { readGitHubSession, SESSION_COOKIE } from "../src/auth/index.js";
import { githubMedia } from "../src/connectors/github-media.js";
import { createMapleHandler } from "../src/route/index.js";
import { createCommentStore } from "../src/store.js";
import { memoryStore } from "../src/testing/memory-store.js";
import { createAttachmentsFake } from "./msw/github-attachments.js";
import { createTestServer, useTestServer } from "./msw/server.js";

import type { MediaResolver } from "../src/route/index.js";

const BASE = "https://preview.example.com/api/maple";
const SECRET = "github-media-route-secret-at-least-32-bytes-long";
const PNG = new Uint8Array([137, 80, 78, 71]);

const fake = createAttachmentsFake(["ghu_reviewer"]);
const server = createTestServer(...fake.handlers);

useTestServer(server, { beforeAll, afterEach, afterAll });
afterEach(() => {
  fake.uploads.length = 0;
});

/** What a host writes: the reviewer's own token, read from their session. */
const media: MediaResolver = async (request) => {
  const session = await readGitHubSession(request, { secret: SECRET });
  if (session === null) return null;
  return githubMedia({ owner: "maple-kit", repo: "app", token: session.token });
};

const handle = createMapleHandler({
  store: createCommentStore(memoryStore()),
  media,
  githubAuth: { clientId: "Iv1.test", secret: SECRET },
});

async function upload(token?: string): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "image/png" };
  if (token !== undefined) {
    const sealed = await sealSession({ token }, { secret: SECRET });
    headers["cookie"] = `${SESSION_COOKIE}=${encodeURIComponent(sealed)}`;
  }
  return handle(new Request(`${BASE}/media`, { method: "POST", body: PNG, headers }));
}

describe("screenshots kept on GitHub", () => {
  it("uploads as the signed-in reviewer and answers with the attachment's key", async () => {
    const response = await upload("ghu_reviewer");

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      connector: "github",
      key: fake.uploads[0]!.id,
      contentType: "image/png",
    });
  });

  it("answers 401, not 500, when nobody is signed in, and uploads nothing", async () => {
    const response = await upload();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Sign in to attach a screenshot" });
    expect(fake.uploads).toHaveLength(0);
  });

  it("answers 502 with GitHub's reason when it refuses the token, not 500", async () => {
    const response = await upload("ghs_installation");

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "GitHub refused the screenshot (404): Not Found",
    });
  });
});
