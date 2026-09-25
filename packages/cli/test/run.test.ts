import { CONNECTOR_METHODS } from "@maple-kit/core";
import { describe, expect, it } from "vitest";

import { HELP } from "../src/help.js";
import { run } from "../src/run.js";

const OPTIONS = { version: "1.2.3" };

describe("run", () => {
  it("prints help when given nothing", async () => {
    expect(await run([], OPTIONS)).toEqual({ output: HELP, exitCode: 0 });
  });

  it("prints help for --help", async () => {
    expect((await run(["--help"], OPTIONS)).output).toBe(HELP);
  });

  it("prints the version for --version", async () => {
    expect(await run(["--version"], OPTIONS)).toEqual({ output: "1.2.3", exitCode: 0 });
  });

  it("answers --version even when a command is given", async () => {
    expect((await run(["connectors", "--version"], OPTIONS)).output).toBe("1.2.3");
  });

  it("exits non-zero on an unknown command and says so", async () => {
    const result = await run(["nope"], OPTIONS);

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('Unknown command "nope"');
  });

  it("lists every connector kind", async () => {
    const output = (await run(["connectors"], OPTIONS)).output;

    for (const kind of Object.keys(CONNECTOR_METHODS)) expect(output).toContain(kind);
  });

  it("says a kind requiring nothing requires none, rather than leaving a blank", async () => {
    const output = (await run(["connectors"], OPTIONS)).output;

    expect(output).toContain("classifier    required: none");
  });

  it("emits JSON for --json", async () => {
    const result = await run(["connectors", "--json"], OPTIONS);
    const parsed: unknown = JSON.parse(result.output);

    expect(parsed).toContainEqual({
      kind: "store",
      required: ["list", "append"],
      optional: ["appendMany", "setStatus", "head", "watch", "approvals", "approve", "unapprove"],
    });
  });

  it("derives the matrix from core rather than a copy", async () => {
    const parsed = JSON.parse((await run(["connectors", "--json"], OPTIONS)).output) as {
      kind: string;
      required: string[];
      optional: string[];
    }[];

    for (const row of parsed) {
      const methods = CONNECTOR_METHODS[row.kind as keyof typeof CONNECTOR_METHODS];
      expect(new Set([...row.required, ...row.optional])).toEqual(new Set(methods));
    }
  });
});
