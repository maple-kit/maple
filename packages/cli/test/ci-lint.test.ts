import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { runCiLint } from "../src/ci-lint.js";
import { run } from "../src/run.js";

import type { Finding } from "@maple-kit/lint";

const API = "https://api.github.com/repos/acme/web";
const sent: { method: string; url: string; body: unknown }[] = [];
let refuse = false;

const server = setupServer(
  http.post(`${API}/check-runs`, async ({ request }) => {
    sent.push({ method: "POST", url: request.url, body: await request.json() });
    return refuse
      ? HttpResponse.json({ message: "Forbidden" }, { status: 403 })
      : HttpResponse.json({ id: 77 });
  }),
  http.patch(`${API}/check-runs/:id`, async ({ request }) => {
    sent.push({ method: "PATCH", url: request.url, body: await request.json() });
    return HttpResponse.json({ id: 77 });
  }),
  http.get(`${API}/commits/abc/check-runs`, () =>
    HttpResponse.json({ check_runs: [{ id: 5, status: "in_progress", app: { id: 9 } }] }),
  ),
);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  sent.length = 0;
  refuse = false;
  server.resetHandlers();
});
afterAll(() => server.close());

function finding(over: Partial<Finding> = {}): Finding {
  return {
    rule: "maple/rendered-touch-target",
    tier: "rendered",
    severity: "error",
    message: "20x20px, under 24px.",
    anchor: { source: "src/Icon.tsx:4:3" },
    ...over,
  };
}

const lintWith = (findings: Finding[]) => () => Promise.resolve({ findings });
const publish = { token: "t", owner: "acme", repo: "web", headSha: "abc" };
const base = { url: "https://preview.test", tokenFiles: [] };

describe("runCiLint", () => {
  it("fails on an error, writes SARIF and publishes annotations", async () => {
    const dir = await mkdtemp(join(tmpdir(), "maple-lint-"));
    const sarifPath = join(dir, "out", "lint.sarif");

    const result = await runCiLint(
      { ...base, sarifPath, publish },
      { lint: lintWith([finding()]), root: dir },
    );

    expect(result).toMatchObject({ conclusion: "failure", checkRunId: 77, sarifPath });
    expect((JSON.parse(await readFile(sarifPath, "utf8")) as { version: string }).version).toBe(
      "2.1.0",
    );
    expect(sent[0]?.body).toMatchObject({
      name: "maple/design-lint",
      head_sha: "abc",
      conclusion: "failure",
      output: { annotations: [{ path: "src/Icon.tsx", start_line: 4 }] },
    });
  });

  it("sends annotations beyond fifty in follow-up updates", async () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      finding({ anchor: { source: `src/f${String(i)}.tsx:1:1` } }),
    );
    await runCiLint({ ...base, publish }, { lint: lintWith(many) });

    expect(sent.map((one) => one.method)).toEqual(["POST", "PATCH", "PATCH"]);
  });

  it("updates its own in-flight run when given an app id", async () => {
    await runCiLint({ ...base, publish: { ...publish, appId: 9 } }, { lint: lintWith([]) });

    expect(sent[0]).toMatchObject({ method: "PATCH" });
    expect(sent[0]?.url).toContain("/check-runs/5");
  });

  it("publishes nothing on a dry run", async () => {
    const result = await runCiLint(base, { lint: lintWith([finding()]) });

    expect(result.checkRunId).toBeUndefined();
    expect(sent).toEqual([]);
  });

  it("is neutral when the preview cannot be reached", async () => {
    const lint = () => Promise.reject(new Error("page.goto: net::ERR_CONNECTION_REFUSED"));
    const result = await runCiLint({ ...base, publish }, { lint });

    expect(result.conclusion).toBe("neutral");
    expect(sent[0]?.body).toMatchObject({ conclusion: "neutral" });
  });

  it("rethrows a broken run rather than calling it neutral", async () => {
    const lint = () => Promise.reject(new Error("the page bundle is missing"));
    await expect(runCiLint(base, { lint })).rejects.toThrow("bundle");
  });

  it("throws GitHub's answer when it refuses the check", async () => {
    refuse = true;
    await expect(runCiLint({ ...base, publish }, { lint: lintWith([]) })).rejects.toThrow("403");
  });
});

describe("maple ci lint", () => {
  const env = { GITHUB_REPOSITORY: "acme/web", GITHUB_SHA: "abc", MAPLE_GITHUB_TOKEN: "t" };
  const go = (args: string[], extra: NodeJS.ProcessEnv = env, findings: Finding[] = []) =>
    run(["ci", "lint", "--url=https://preview.test", ...args], {
      version: "0",
      env: extra,
      lint: lintWith(findings),
    });

  it("exits 1 on a failure and 0 on success", async () => {
    expect((await go([], env, [finding()])).exitCode).toBe(1);
    expect((await go([])).exitCode).toBe(0);
  });

  it("takes the head commit from the pull request event, not GITHUB_SHA", async () => {
    const dir = await mkdtemp(join(tmpdir(), "maple-event-"));
    const path = join(dir, "event.json");
    await writeFile(path, JSON.stringify({ pull_request: { head: { sha: "abc" } } }));

    await go([], { ...env, GITHUB_SHA: "merge-commit", GITHUB_EVENT_PATH: path });

    expect(sent[0]?.body).toMatchObject({ head_sha: "abc" });
  });

  it("prints the verdict and publishes nothing with --dry-run, even without a token", async () => {
    const result = await go(["--dry-run"], {}, [finding()]);

    expect(result.output).toContain("Dry run");
    expect(sent).toEqual([]);
  });

  it("names what is missing instead of publishing", async () => {
    const result = await go([], {});

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("MAPLE_GITHUB_TOKEN");
  });

  it("writes GITHUB_OUTPUT", async () => {
    const dir = await mkdtemp(join(tmpdir(), "maple-out-"));
    const out = join(dir, "output");
    await writeFile(out, "");

    await go([], { ...env, GITHUB_OUTPUT: out });

    expect(await readFile(out, "utf8")).toContain("conclusion=success");
  });

  it("reports a GitHub refusal as an error", async () => {
    refuse = true;
    const result = await go([]);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("403");
  });
});

describe("maple lint", () => {
  it("groups findings by rule with file:line:col, and exits 1 on an error", async () => {
    const result = await run(
      [
        "lint",
        "--url=https://preview.test",
        "--tokens=a.css",
        "--tokens=b.css",
        "--viewport=375x812",
      ],
      { version: "0", lint: lintWith([finding()]) },
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("maple/rendered-touch-target (1)");
    expect(result.output).toContain("src/Icon.tsx:4:3");
  });

  it("prints JSON", async () => {
    const result = await run(["lint", "--url=https://preview.test", "--json"], {
      version: "0",
      lint: lintWith([]),
    });

    expect(JSON.parse(result.output)).toEqual({ conclusion: "success", findings: [] });
  });

  it("rejects a missing url and a malformed viewport", async () => {
    expect((await run(["lint"], { version: "0" })).exitCode).toBe(1);
    const bad = await run(["lint", "--url=x", "--viewport=wide"], { version: "0" });
    expect(bad.output).toContain("375x812");
  });
});
