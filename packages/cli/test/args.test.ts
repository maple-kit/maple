import { describe, expect, it } from "vitest";

import { isSet, parseArgs } from "../src/args.js";

describe("parseArgs", () => {
  it("returns no command for an empty argv", () => {
    expect(parseArgs([])).toEqual({ positionals: [], flags: {} });
  });

  it("takes the first positional as the command", () => {
    expect(parseArgs(["connectors"]).command).toBe("connectors");
  });

  it("keeps later positionals in order", () => {
    expect(parseArgs(["list", "main", "c_1"]).positionals).toEqual(["main", "c_1"]);
  });

  it("records a bare flag as true", () => {
    expect(parseArgs(["--json"]).flags).toEqual({ json: true });
  });

  it("splits --name=value", () => {
    expect(parseArgs(["--branch=feature/x"]).flags).toEqual({ branch: "feature/x" });
  });

  it("keeps equals signs inside a value", () => {
    expect(parseArgs(["--filter=a=b"]).flags["filter"]).toBe("a=b");
  });

  it("accepts an empty value", () => {
    expect(parseArgs(["--branch="]).flags["branch"]).toBe("");
  });

  it("lets a later flag win over an earlier one", () => {
    expect(parseArgs(["--branch=a", "--branch=b"]).flags["branch"]).toBe("b");
  });

  it("does not treat a lone dash as a flag", () => {
    expect(parseArgs(["-"]).command).toBe("-");
  });
});

describe("isSet", () => {
  it("is true for a bare flag", () => {
    expect(isSet({ json: true }, "json")).toBe(true);
  });

  it("is true for any value other than the string false", () => {
    expect(isSet({ json: "yes" }, "json")).toBe(true);
  });

  it("is false for --json=false", () => {
    expect(isSet({ json: "false" }, "json")).toBe(false);
  });

  it("is false for a flag that was not given", () => {
    expect(isSet({}, "json")).toBe(false);
  });
});
