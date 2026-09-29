import { describe, expect, it } from "vitest";

import { run } from "../src/run.js";

import type { Bridge, BridgeOptions } from "@maple-kit/core/local";

const OPTIONS = { version: "1.2.3" };
const PREVIEW = "https://feat-x.preview.example/menu";

/** A bridge that listens on nothing, so the command's own words are what is tested. */
function fake(record: BridgeOptions[]): (options: BridgeOptions) => Promise<Bridge> {
  return (options) => {
    record.push(options);
    return Promise.resolve({
      url: "http://127.0.0.1:52411",
      token: "t".repeat(43),
      origin: "https://feat-x.preview.example",
      link: (previewUrl) => `${previewUrl}#maple-solo=${"t".repeat(43)}&maple-bridge=x`,
      close: () => Promise.resolve(),
    });
  };
}

describe("maple solo", () => {
  it("starts the bridge for the preview's origin and prints the pairing link", async () => {
    const started: BridgeOptions[] = [];

    const result = await run(["solo", PREVIEW], { ...OPTIONS, start: fake(started), cwd: "/repo" });

    expect(started).toEqual([{ origin: PREVIEW, cwd: "/repo" }]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain(`${PREVIEW}#maple-solo=${"t".repeat(43)}`);
    expect(result.output).toContain("http://127.0.0.1:52411");
  });

  it("passes --port on", async () => {
    const started: BridgeOptions[] = [];

    await run(["solo", PREVIEW, "--port", "4100"], { ...OPTIONS, start: fake(started) });

    expect(started[0]).toMatchObject({ port: 4100 });
  });

  it("emits the link as JSON for --json", async () => {
    const result = await run(["solo", PREVIEW, "--json"], { ...OPTIONS, start: fake([]) });

    expect(JSON.parse(result.output)).toEqual({
      link: `${PREVIEW}#maple-solo=${"t".repeat(43)}&maple-bridge=x`,
      bridge: "http://127.0.0.1:52411",
      origin: "https://feat-x.preview.example",
    });
  });

  it.each<[string, string[], RegExp]>([
    ["no address", ["solo"], /Usage\n {2}maple solo <preview-url>/],
    ["a port that is not one", ["solo", PREVIEW, "--port", "http"], /--port must be a port number/],
    ["a port out of range", ["solo", PREVIEW, "--port", "70000"], /--port must be a port number/],
  ])("refuses %s", async (_case, argv, message) => {
    const started: BridgeOptions[] = [];

    const result = await run(argv, { ...OPTIONS, start: fake(started) });

    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(message);
    expect(started).toEqual([]);
  });

  it("says so when the address cannot be paired", async () => {
    const result = await run(["solo", "ftp://example.com"], OPTIONS);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("Could not start the solo bridge");
  });
});
