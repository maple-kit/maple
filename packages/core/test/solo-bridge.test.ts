import { existsSync, readdirSync, readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SOLO_HEADER, SOLO_PARAM } from "../src/client/solo.js";
import { refusalFor, startBridge } from "../src/local/bridge.js";
import { addWorktree, git, initRepo, scratch } from "./local-repo.js";

import type { GateRequest, GateRules } from "../src/local/bridge.js";

const ORIGIN = "https://feat-x.preview.example";
const TOKEN = "t".repeat(43);
const BRANCH = "feat/solo-test";
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const clean of cleanups.splice(0)) await clean();
});

/** A repository on its own branch, so the folder under `.maple/` has a known name. */
function repository(): string {
  const made = scratch();
  cleanups.push(made.remove);
  const path = initRepo(made.dir);
  git(path, "checkout", "-q", "-b", BRANCH);
  return path;
}

async function bridge(cwd: string = repository()) {
  const started = await startBridge({ origin: ORIGIN, cwd, token: TOKEN });
  cleanups.push(() => started.close());
  return { started, cwd };
}

const RULES: GateRules = {
  origin: ORIGIN,
  token: TOKEN,
  hosts: new Set(["127.0.0.1:4100", "localhost:4100"]),
};

function gate(over: Partial<GateRequest> & { headers?: Record<string, string> } = {}): GateRequest {
  return {
    method: "GET",
    target: "/api/maple/comments?branch=x",
    ...over,
    headers: { host: "127.0.0.1:4100", origin: ORIGIN, [SOLO_HEADER]: TOKEN, ...over.headers },
  };
}

describe("the gate in front of the route", () => {
  it.each<[string, GateRequest, number | undefined]>([
    ["a request with the token from the paired origin", gate(), undefined],
    [
      "the same over the other loopback name",
      gate({ headers: { host: "localhost:4100" } }),
      undefined,
    ],
    ["a request with no token", gate({ headers: { [SOLO_HEADER]: "" } }), 401],
    ["a request with the wrong token", gate({ headers: { [SOLO_HEADER]: "x".repeat(43) } }), 401],
    ["a token of another length", gate({ headers: { [SOLO_HEADER]: "short" } }), 401],
    ["the token from another origin", gate({ headers: { origin: "https://other.example" } }), 403],
    [
      "the token from the same host over http",
      gate({ headers: { origin: "http://feat-x.preview.example" } }),
      403,
    ],
    ["the token with no origin at all", gate({ headers: { origin: "" } }), 403],
    ["a name that is not the bridge's", gate({ headers: { host: "rebind.example:4100" } }), 403],
    ["the right name on another port", gate({ headers: { host: "127.0.0.1:4101" } }), 403],
    [
      "a token in the query on a route that is not a screenshot",
      gate({
        target: `/api/maple/comments?${SOLO_PARAM}=${TOKEN}`,
        headers: { [SOLO_HEADER]: "" },
      }),
      401,
    ],
  ])("%s", (_case, request, status) => {
    expect(refusalFor(request, RULES)?.status).toBe(status);
  });

  it.each<[string, GateRequest, number | undefined]>([
    [
      "a screenshot read with the token in the query and the referrer's origin",
      gate({
        target: `/api/maple/media/shot-1?${SOLO_PARAM}=${TOKEN}`,
        headers: { [SOLO_HEADER]: "", origin: "", referer: `${ORIGIN}/menu?x=1` },
      }),
      undefined,
    ],
    [
      "a screenshot read from another referrer",
      gate({
        target: `/api/maple/media/shot-1?${SOLO_PARAM}=${TOKEN}`,
        headers: { [SOLO_HEADER]: "", origin: "", referer: "https://other.example/" },
      }),
      403,
    ],
    [
      "a screenshot read with no referrer",
      gate({
        target: `/api/maple/media/shot-1?${SOLO_PARAM}=${TOKEN}`,
        headers: { [SOLO_HEADER]: "", origin: "" },
      }),
      403,
    ],
    [
      "a screenshot read with the wrong token in the query",
      gate({
        target: `/api/maple/media/shot-1?${SOLO_PARAM}=nope`,
        headers: { [SOLO_HEADER]: "", origin: "", referer: `${ORIGIN}/` },
      }),
      401,
    ],
  ])("%s", (_case, request, status) => {
    expect(refusalFor(request, RULES)?.status).toBe(status);
  });

  it.each<[string, string, number | undefined]>([
    ["a preflight from the paired origin, which carries no token", ORIGIN, undefined],
    ["a preflight from another origin", "https://other.example", 403],
  ])("%s", (_case, origin, status) => {
    const request = gate({ method: "OPTIONS", headers: { origin, [SOLO_HEADER]: "" } });
    expect(refusalFor(request, RULES)?.status).toBe(status);
  });
});

describe("the bridge over HTTP", () => {
  const AUTH = { [SOLO_HEADER]: TOKEN, origin: ORIGIN };

  it("listens on 127.0.0.1 and nowhere else", async () => {
    const { started } = await bridge();

    expect(started.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it.each<[string, Record<string, string>, number]>([
    ["no token", { origin: ORIGIN }, 401],
    ["a wrong token", { [SOLO_HEADER]: "x".repeat(43), origin: ORIGIN }, 401],
    ["a wrong origin", { [SOLO_HEADER]: TOKEN, origin: "https://other.example" }, 403],
    ["no origin", { [SOLO_HEADER]: TOKEN }, 403],
  ])(
    "refuses %s, says nothing a page could read, and writes nothing",
    async (_case, headers, status) => {
      const { started, cwd } = await bridge();

      const response = await fetch(`${started.url}/api/maple/comments`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ branch: BRANCH, body: "Sneaky.", anchor: { kind: "page" } }),
      });

      expect(response.status).toBe(status);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
      expect(existsSync(join(cwd, ".maple"))).toBe(false);
    },
  );

  it("refuses a request addressed to a name that is not the bridge's", async () => {
    const { started } = await bridge();
    const { port } = new URL(started.url);

    const status = await new Promise<number>((resolve, reject) => {
      const call = httpRequest(
        {
          host: "127.0.0.1",
          port,
          path: "/api/maple/me",
          headers: { host: "rebind.example", ...AUTH },
        },
        (response) => {
          response.resume();
          resolve(response.statusCode ?? 0);
        },
      );
      call.on("error", reject);
      call.end();
    });

    expect(status).toBe(403);
  });

  it("answers a preflight for the paired origin only, and opts in to a private network", async () => {
    const { started } = await bridge();
    const ask = (origin: string) =>
      fetch(`${started.url}/api/maple/comments`, {
        method: "OPTIONS",
        headers: {
          origin,
          "access-control-request-method": "POST",
          "access-control-request-headers": SOLO_HEADER,
          "access-control-request-private-network": "true",
        },
      });

    const allowed = await ask(ORIGIN);
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(allowed.headers.get("access-control-allow-headers")).toContain(SOLO_HEADER);
    expect(allowed.headers.get("access-control-allow-private-network")).toBe("true");

    const refused = await ask("https://other.example");
    expect(refused.status).toBe(403);
    expect(refused.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("stores a paired comment and screenshot under .maple/<branch>/ and serves them back", async () => {
    const { started, cwd } = await bridge();
    const call = (path: string, init: RequestInit) =>
      fetch(`${started.url}/api/maple${path}`, {
        ...init,
        headers: { ...AUTH, ...(init.headers as Record<string, string>) },
      });

    const shot = await call("/media", {
      method: "POST",
      body: PNG,
      headers: { "content-type": "image/png" },
    });
    expect(shot.status).toBe(201);
    const ref = (await shot.json()) as { key: string; contentType: string };

    const posted = await call("/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        branch: BRANCH,
        body: "The header wraps.",
        anchor: { kind: "page" },
        createdAt: "2026-09-29T10:00:00.000Z",
        attachments: [ref],
      }),
    });
    expect(posted.status).toBe(201);
    expect(posted.headers.get("access-control-allow-origin")).toBe(ORIGIN);

    const folder = join(cwd, ".maple", "feat-solo-test");
    const ledger = JSON.parse(readFileSync(join(folder, "comments.json"), "utf8")) as {
      comments: { body: string; status: string; branch: string }[];
    };
    expect(ledger.comments).toMatchObject([
      { body: "The header wraps.", status: "open", branch: BRANCH },
    ]);
    expect(readdirSync(join(folder, "media"))).toEqual([`${ref.key}.png`]);

    const listed = await call(`/comments?branch=${encodeURIComponent(BRANCH)}`, {});
    expect(((await listed.json()) as { comments: unknown[] }).comments).toHaveLength(1);

    const image = await fetch(
      `${started.url}/api/maple/media/${ref.key}?type=image%2Fpng&${SOLO_PARAM}=${TOKEN}`,
      { headers: { referer: `${ORIGIN}/menu` } },
    );
    expect(image.status).toBe(200);
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(PNG);
  });

  it("writes where the main checkout's worktrees do, not into the preview", async () => {
    const made = scratch();
    cleanups.push(made.remove);
    const main = initRepo(made.dir);
    const worktree = addWorktree(main, "feat/wt", "wt");
    const { started } = await bridge(worktree);

    await fetch(`${started.url}/api/maple/comments`, {
      method: "POST",
      headers: { ...AUTH, "content-type": "application/json" },
      body: JSON.stringify({ branch: "feat/wt", body: "One.", anchor: { kind: "page" } }),
    });

    expect(existsSync(join(main, ".maple", "feat-wt", "comments.json"))).toBe(true);
  });

  it("rejects an origin it cannot pair", async () => {
    await expect(startBridge({ origin: "ftp://example.com" })).rejects.toThrow(RangeError);
  });

  it("prints a pairing link that carries the token and its own address", async () => {
    const { started } = await bridge();
    const link = new URL(started.link(`${ORIGIN}/menu?x=1#old`));

    expect(link.origin + link.pathname + link.search).toBe(`${ORIGIN}/menu?x=1`);
    const fragment = new URLSearchParams(link.hash.slice(1));
    expect(fragment.get(SOLO_PARAM)).toBe(TOKEN);
    expect(fragment.get("maple-bridge")).toBe(started.url);
  });
});
