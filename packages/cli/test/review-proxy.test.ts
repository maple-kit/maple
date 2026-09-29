import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sampleComment } from "@maple-kit/core/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startReview } from "../src/review/session.js";
import { BINARY, NONCE, startUpstream, STRICT_POLICY } from "./review-fixture.js";

import type { ReviewSession } from "../src/review/session.js";
import type { Upstream } from "./review-fixture.js";

const OVERLAY = "window.__overlay = true;";

let upstream: Upstream;
let session: ReviewSession;
let cwd: string;
const relaxed: (readonly string[])[] = [];

beforeAll(async () => {
  upstream = await startUpstream();
  cwd = mkdtempSync(join(tmpdir(), "maple-review-"));
  session = await startReview({
    cwd,
    env: {},
    target: upstream.url,
    overlay: OVERLAY,
    onRelaxed: (directives) => relaxed.push(directives),
  });
});

afterAll(async () => {
  await session.stop();
  await upstream.close();
  rmSync(cwd, { recursive: true, force: true });
});

const get = (path: string, init?: RequestInit) => fetch(new URL(path, session.url), init);

describe("maple review's proxy", () => {
  it("serves the overlay script itself, so the app gains no route", async () => {
    const response = await get("/__maple/overlay.js");

    expect(response.headers.get("content-type")).toContain("text/javascript");
    expect(await response.text()).toBe(OVERLAY);
    expect(upstream.seen.some((seen) => seen.url.startsWith("/__maple"))).toBe(false);
  });

  it("adds one script tag to the page and nothing else, carrying the page's own nonce", async () => {
    const html = await (await get("/")).text();
    const tag = /<script src="\/__maple\/overlay\.js"[^>]*><\/script>/.exec(html)?.[0];

    expect(tag).toContain(`nonce="${NONCE}"`);
    expect(tag).toContain('data-base-path="/__maple/api"');
    expect(tag).toContain(`data-branch="localhost-${upstream.url.port}"`);
    expect(html.replace(tag ?? "", "")).toContain("<h1>Hello</h1>");
    expect(html.match(/overlay\.js/g)).toHaveLength(1);
  });

  it("relaxes the policy on the proxied response only, and only as far as the overlay needs", async () => {
    const proxied = (await get("/")).headers.get("content-security-policy");
    const direct = await fetch(new URL("/", upstream.url));

    expect(direct.headers.get("content-security-policy")).toBe(STRICT_POLICY);
    expect(proxied).toBe(
      STRICT_POLICY.replace(
        "connect-src https://api.example.test",
        "connect-src https://api.example.test 'self'",
      ).replace("img-src 'self'", "img-src 'self' blob:"),
    );
    expect(relaxed.at(-1)).toEqual(["connect-src", "img-src"]);
  });

  it("adds no policy to a page that had none", async () => {
    const response = await get("/plain");
    const html = await response.text();

    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(html).toContain('<script src="/__maple/overlay.js"');
    expect(html).not.toContain("nonce=");
  });

  it("passes every other response through byte for byte", async () => {
    const response = await get("/asset.bin");

    expect(Buffer.from(await response.arrayBuffer())).toEqual(BINARY);
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
  });

  it("points a redirect at the proxy, not the app behind it", async () => {
    const response = await get("/redirect", { redirect: "manual" });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${new URL(session.url).origin}/plain`);
  });

  it("addresses the app as itself, so its host checks pass", async () => {
    await get("/plain", { headers: { origin: new URL(session.url).origin } });
    const arrived = upstream.seen.at(-1)?.headers;

    expect(arrived?.host).toBe(upstream.url.host);
    expect(arrived?.origin).toBe(upstream.url.origin);
    expect(arrived?.["accept-encoding"]).toBe("identity");
  });

  it("passes a WebSocket upgrade through, which is what keeps HMR working", async () => {
    const echoed = await new Promise<string>((resolve, reject) => {
      const client = httpRequest(new URL("/hmr", session.url), {
        headers: {
          connection: "Upgrade",
          upgrade: "websocket",
          origin: new URL(session.url).origin,
        },
      });
      client.on("upgrade", (_response, socket) => {
        socket.once("data", (chunk) => {
          socket.destroy();
          resolve(chunk.toString("utf8"));
        });
        socket.write("ping over the tunnel");
      });
      client.on("error", reject);
      client.end();
    });

    expect(echoed).toBe("ping over the tunnel");
    expect(upstream.seen.at(-1)).toMatchObject({
      url: "/hmr",
      headers: { host: upstream.url.host, origin: upstream.url.origin },
    });
  });

  it("answers 502 and says what it could not reach when the app is down", async () => {
    const down = await startUpstream();
    const solo = await startReview({ cwd, env: {}, target: down.url, overlay: OVERLAY });
    await down.close();

    const response = await fetch(new URL("/", solo.url));

    expect(response.status).toBe(502);
    expect(await response.text()).toContain(`could not reach ${down.url.origin}`);
    await solo.stop();
  });
});

describe("with no store configured", () => {
  it("writes a comment made through the proxy to the local file store", async () => {
    const draft = sampleComment({ branch: session.store.branch });

    const posted = await get("/__maple/api/comments", {
      method: "POST",
      body: JSON.stringify(draft),
    });
    const key = `localhost-${upstream.url.port}`;
    const file = JSON.parse(readFileSync(join(cwd, ".maple", key, "comments.json"), "utf8")) as {
      comments: { body: string }[];
    };

    expect(posted.status).toBe(201);
    expect(session.store).toMatchObject({ kind: "file", where: join(cwd, ".maple", key) });
    expect(file.comments.map((comment) => comment.body)).toEqual([draft.body]);
  });

  it("lists it back through the same route", async () => {
    const listed = (await (
      await get(`/__maple/api/comments?branch=${encodeURIComponent(session.store.branch)}`)
    ).json()) as { comments: unknown[] };

    expect(listed.comments).toHaveLength(1);
  });

  it("serves an error from the route as the route wrote it", async () => {
    const response = await get("/__maple/api/comments", { method: "POST", body: "not json" });

    expect(response.status).toBe(400);
  });
});
