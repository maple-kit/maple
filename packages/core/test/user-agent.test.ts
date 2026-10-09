import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createDeviceFlow } from "../src/auth/index.js";
import { githubStore } from "../src/connectors/github.js";
import { createTestServer, useTestServer } from "./msw/server.js";

const server = createTestServer();
useTestServer(server, { beforeAll, afterEach, afterAll });

describe("the User-Agent header", () => {
  it("is sent on a GitHub API request, which Workers' fetch does not add", async () => {
    let seen: string | null = null;
    server.use(
      http.get("https://api.github.com/*", ({ request }) => {
        seen = request.headers.get("user-agent");
        return HttpResponse.json([]);
      }),
    );

    await githubStore({ owner: "maple-kit", repo: "app", token: "t" }).list({ branch: "x" });

    expect(seen).toBe("maple-kit");
  });

  it("is sent on a device flow request", async () => {
    let seen: string | null = null;
    server.use(
      http.post("https://github.com/login/device/code", ({ request }) => {
        seen = request.headers.get("user-agent");
        return HttpResponse.json({}, { status: 403 });
      }),
    );

    await expect(createDeviceFlow({ clientId: "Iv1.test" }).start()).rejects.toThrow("403");
    expect(seen).toBe("maple-kit");
  });
});
