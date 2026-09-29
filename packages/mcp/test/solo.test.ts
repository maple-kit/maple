import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parsePairing, SOLO_HEADER } from "@maple-kit/core/client";
import { startBridge } from "@maple-kit/core/local";
import { afterEach, describe, expect, it } from "vitest";

import { storeFromEnvironment } from "../src/config.js";
import { createToolHandlers } from "../src/handlers.js";
import { createSoloStarter } from "../src/solo.js";

import type { SoloStarter } from "../src/solo.js";
import type { Bridge, BridgeOptions } from "@maple-kit/core/local";

const ORIGIN = "https://feat-x.preview.example";
const BRANCH = "feat/x";

const directories: string[] = [];
const bridges: Bridge[] = [];
afterEach(async () => {
  for (const bridge of bridges.splice(0)) await bridge.close();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

/** A directory that is not a repository, so the folder is `.maple/default`. */
function project(): string {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "maple-mcp-solo-")));
  directories.push(directory);
  return directory;
}

/** The starter over the real bridge, remembering each one so it is closed. */
function starter(cwd: string): SoloStarter {
  return createSoloStarter({
    cwd,
    start: async (options: BridgeOptions) => {
      const bridge = await startBridge(options);
      bridges.push(bridge);
      return bridge;
    },
  });
}

/** What a paired overlay does: one comment, from the paired origin, with the token. */
async function post(link: string, body: string): Promise<Response> {
  const pairing = parsePairing(new URL(link).hash);
  if (!pairing) throw new Error("The link carries no pairing.");
  return fetch(`${pairing.bridge}/api/maple/comments`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      [SOLO_HEADER]: pairing.token,
    },
    body: JSON.stringify({ branch: BRANCH, body, anchor: { kind: "page" } }),
  });
}

describe("solo mode through the MCP server", () => {
  it("lists what a paired preview posted, having started the bridge itself", async () => {
    const cwd = project();
    const solo = starter(cwd);
    const handlers = createToolHandlers({ store: storeFromEnvironment({}, cwd), solo });

    const { link } = await handlers.startSolo({ previewUrl: `${ORIGIN}/menu` });
    expect((await post(link, "The header wraps.")).status).toBe(201);

    expect(existsSync(join(cwd, ".maple", "default", "comments.json"))).toBe(true);
    const listed = await handlers.listComments({ branch: BRANCH, statuses: ["open"] });
    expect(listed).toMatchObject([{ body: "The header wraps.", status: "open" }]);

    await handlers.resolveComment({ id: listed[0]!.id, sha: "abc1234" });
    const ledger = readFileSync(join(cwd, ".maple", "default", "comments.json"), "utf8");
    expect(ledger).toContain('"resolved"');
  });

  it("hands the same link back for the same origin, and another for another", async () => {
    const solo = starter(project());

    const first = await solo(`${ORIGIN}/a`);
    const again = await solo(`${ORIGIN}/b`);
    const other = await solo("https://feat-y.preview.example/");

    expect(new URL(again.link).pathname).toBe("/b");
    expect(parsePairing(new URL(again.link).hash)).toEqual(parsePairing(new URL(first.link).hash));
    expect(other.bridge).not.toBe(first.bridge);
  });

  it("does not keep a bridge that failed to start", async () => {
    let attempts = 0;
    const solo = createSoloStarter({
      start: () => {
        attempts += 1;
        return Promise.reject(new Error("port taken"));
      },
    });

    await expect(solo(ORIGIN)).rejects.toThrow("port taken");
    await expect(solo(ORIGIN)).rejects.toThrow("port taken");
    expect(attempts).toBe(2);
  });

  it("refuses when the server reads a forge, whose store would never see the comments", async () => {
    const forge = {
      GITHUB_TOKEN: "unused",
      MAPLE_GITHUB_OWNER: "acme",
      MAPLE_GITHUB_REPO: "shop",
    };
    const handlers = createToolHandlers({
      store: storeFromEnvironment(forge, project()),
      solo: starter(project()),
    });

    await expect(handlers.startSolo({ previewUrl: ORIGIN })).rejects.toThrow(/MAPLE_STORE=file/);
  });

  it("says so when the server was given no starter", async () => {
    const cwd = project();
    const handlers = createToolHandlers({ store: storeFromEnvironment({}, cwd) });

    await expect(handlers.startSolo({ previewUrl: ORIGIN })).rejects.toThrow(/not available/);
  });
});
