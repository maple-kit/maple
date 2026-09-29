import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { findAddress, startDevServer } from "../src/review/dev-server.js";
import { detectPackageManager } from "../src/review/package-manager.js";
import { run } from "../src/run.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "maple-review-app-"));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}

describe("detectPackageManager", () => {
  it.each([
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["package-lock.json", "npm"],
  ] as const)("reads %s as %s", (lockfile, expected) => {
    expect(detectPackageManager(project({ [lockfile]: "" }))).toBe(expected);
  });

  it("finds a workspace's lockfile above the app", () => {
    const root = project({ "pnpm-lock.yaml": "", "apps/web/package.json": "{}" });

    expect(detectPackageManager(join(root, "apps", "web"))).toBe("pnpm");
  });

  it("falls back to the packageManager field, then to npm", () => {
    expect(
      detectPackageManager(project({ "package.json": '{"packageManager":"yarn@4.1.0"}' })),
    ).toBe("yarn");
    expect(detectPackageManager(project({ "package.json": "{}" }))).toBe("npm");
  });
});

describe("findAddress", () => {
  it.each([
    [
      "Vite",
      "  \u001B[32m➜\u001B[39m  Local:   \u001B[36mhttp://localhost:\u001B[1m5173\u001B[22m/\u001B[39m",
      "http://localhost:5173/",
    ],
    ["Next", "   - Local:        http://localhost:3000", "http://localhost:3000/"],
    ["a server on every interface", "listening on http://0.0.0.0:8080", "http://localhost:8080/"],
    ["an IPv6 loopback", "ready on http://[::1]:4000", "http://[::1]:4000/"],
    ["output with no address", "compiling...", undefined],
    ["an address that is not local", "docs at https://vite.dev:443", undefined],
  ] as const)("reads %s", (_name, output, expected) => {
    expect(findAddress(output)?.href).toBe(expected);
  });
});

describe("startDevServer", () => {
  const script = `node -e "console.log('Local: http://localhost:4321/'); setInterval(() => {}, 1000)"`;

  it("runs the dev script and resolves with the address it printed", async () => {
    const cwd = project({ "package.json": JSON.stringify({ scripts: { dev: script } }) });
    const output: string[] = [];

    const server = await startDevServer({ cwd, onOutput: (text) => output.push(text) });
    server.stop();

    expect(server.url.href).toBe("http://localhost:4321/");
    expect(output.join("")).toContain("Local:");
  });

  it("runs the script --script names", async () => {
    const cwd = project({ "package.json": JSON.stringify({ scripts: { start: script } }) });

    const server = await startDevServer({ cwd, script: "start", onOutput: () => undefined });
    server.stop();

    expect(server.url.port).toBe("4321");
  });

  it("says what to do when there is no such script", async () => {
    const cwd = project({ "package.json": JSON.stringify({ scripts: {} }) });

    await expect(startDevServer({ cwd })).rejects.toThrow(/no "dev" script.*--port or --url/s);
  });

  it("reports a script that exits before printing an address", async () => {
    const cwd = project({
      "package.json": JSON.stringify({ scripts: { dev: 'node -e "process.exit(3)"' } }),
    });

    await expect(startDevServer({ cwd, onOutput: () => undefined })).rejects.toThrow(/exited/);
  });
});

describe("maple review's flags", () => {
  const OPTIONS = { version: "0" };

  it.each([
    ["--port and --url together", ["--port", "3000", "--url", "http://localhost:3000"], "not both"],
    ["a port that is not a number", ["--port", "abc"], "must be a port number"],
    ["a port out of range", ["--port", "70000"], "must be a port number"],
    ["a url that is not http", ["--url", "file:///x"], "must be an http or https address"],
    ["an unknown flag", ["--nope"], "Its flags:"],
  ] as const)("refuses %s", async (_name, flags, said) => {
    const result = await run(["review", "--no-open", ...flags], OPTIONS);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain(said);
  });

  it("says there is no dev script where the folder has none", async () => {
    const cwd = project({ "package.json": "{}" });

    const result = await run(["review", "--no-open"], { ...OPTIONS, cwd });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('no "dev" script');
  });
});
