import { describe, expect, it } from "vitest";

import { memoryRules } from "../src/testing/memory-rules.js";

import type { Rule, RuleRequest } from "../src/connectors/types.js";

const rule: Rule = { id: "t/a", question: "Is it fine?", appliesTo: "p", severity: "error" };
const request: RuleRequest = {
  url: "https://preview.test/",
  viewport: { width: 800, height: 600 },
  targets: [{ rule: "t/a", html: "<p>x</p>", anchor: { selector: "#x" } }],
};

describe("the in-memory rules connector", () => {
  it("passes everything unless told what violates", async () => {
    expect(await memoryRules({ rules: [rule] }).evaluate(request)).toEqual([]);
  });

  it("reports a violation at the target's anchor, with the rule's severity", async () => {
    const connector = memoryRules({ rules: [rule], violation: () => "Too loud." });

    expect(await connector.evaluate(request)).toEqual([
      {
        rule: "t/a",
        tier: "judged",
        severity: "error",
        message: "Too loud.",
        anchor: { selector: "#x" },
      },
    ]);
  });

  it("skips a target whose rule it does not declare", async () => {
    const connector = memoryRules({ violation: () => "Too loud." });
    expect(await connector.evaluate(request)).toEqual([]);
  });

  it("keeps every request it was asked, until reset", async () => {
    const connector = memoryRules({ rules: [rule] });
    await connector.evaluate(request);
    expect(connector.asked()).toEqual([request]);

    connector.reset();
    expect(connector.asked()).toEqual([]);
  });

  it("rejects with the error it was given", async () => {
    const connector = memoryRules({ failWith: new Error("down") });
    await expect(connector.evaluate(request)).rejects.toThrow("down");
  });

  it("reports the name it was given", () => {
    expect(memoryRules({ name: "fake" }).name).toBe("fake");
  });
});
