import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  DEFAULT_RULES_TIMEOUT_MS,
  jevRules,
  MAX_REQUEST_STATE_CHARS,
  MAX_TARGET_HTML_CHARS,
} from "../src/index.js";
import { createTestServer, useTestServer } from "./msw/server.js";
import { createSystemOneFake } from "./msw/systemone.js";

import type { Rule, RuleRequest } from "@maple-kit/core/connectors";

const fake = createSystemOneFake();
const server = createTestServer(...fake.handlers);

useTestServer(server, { afterAll, afterEach, beforeAll });
afterEach(() => fake.reset());

const ONE_PRIMARY: Rule = {
  id: "app/one-primary",
  question: "Is this a second primary button?",
  appliesTo: "button",
};
const PLAIN_COPY: Rule = {
  id: "app/plain-copy",
  question: "Is this copy full of jargon?",
  appliesTo: "p",
  severity: "warn",
};
const RULES: readonly Rule[] = [ONE_PRIMARY, PLAIN_COPY];

/** A request with one target per rule id given. */
function request(rules: readonly string[], html = "<button>Save</button>"): RuleRequest {
  return {
    url: "https://preview.example/dash",
    viewport: { width: 1280, height: 800 },
    targets: rules.map((rule, index) => ({
      rule,
      html,
      anchor: { selector: `main > :nth-child(${index + 1})` },
    })),
  };
}

function connector(options: Partial<Parameters<typeof jevRules>[0]> = {}) {
  return jevRules({ apiKey: "test-key", rules: RULES, ...options });
}

describe("jevRules", () => {
  it("judges every element in one request and flags those at the threshold", async () => {
    const findings = await connector().evaluate(request(["app/one-primary", "app/plain-copy"]));

    expect(fake.asked).toHaveLength(1);
    expect(Object.keys(fake.asked[0]?.questions ?? {})).toEqual(["target:0", "target:1"]);
    expect(fake.asked[0]?.questions["target:0"]?.type).toBe("noul");
    expect(findings).toEqual([
      {
        rule: "app/one-primary",
        tier: "judged",
        severity: "advice",
        message: "Is this a second primary button? Judged yes (p=0.80).",
        anchor: { selector: "main > :nth-child(1)" },
      },
    ]);
  });

  it("uses the rule's severity, and a threshold the host chose", async () => {
    const rules = [{ ...ONE_PRIMARY, severity: "error" as const }, PLAIN_COPY];
    const jev = connector({ rules, threshold: 0.1 });

    const findings = await jev.evaluate(request(["app/one-primary", "app/plain-copy"]));
    expect(findings.map((f) => [f.rule, f.severity])).toEqual([
      ["app/one-primary", "error"],
      ["app/plain-copy", "warn"],
    ]);
  });

  it("returns nothing for a target the judge does not flag", async () => {
    const findings = await connector({ threshold: 0.9 }).evaluate(request(["app/one-primary"]));
    expect(findings).toEqual([]);
  });

  it("asks nothing of a page with no targets", async () => {
    expect(await connector().evaluate(request([]))).toEqual([]);
    expect(fake.asked).toHaveLength(0);
  });

  it("sends the page and the elements' html as the state", async () => {
    await connector().evaluate(request(["app/one-primary"]));
    expect(fake.asked[0]?.state).toEqual({
      page: { url: "https://preview.example/dash", viewport: { width: 1280, height: 800 } },
      targets: [{ html: "<button>Save</button>" }],
    });
  });

  it("cuts one element's html at its cap", async () => {
    await connector().evaluate(request(["app/one-primary"], "x".repeat(MAX_TARGET_HTML_CHARS * 2)));
    const state = fake.asked[0]?.state as { targets: { html: string }[] };
    expect(state.targets[0]?.html.length).toBeLessThan(MAX_TARGET_HTML_CHARS + 50);
    expect(state.targets[0]?.html).toContain("truncated");
  });

  it("splits a page that does not fit one request, keeping every element", async () => {
    const count = Math.ceil(MAX_REQUEST_STATE_CHARS / MAX_TARGET_HTML_CHARS) + 2;
    const ids = Array.from({ length: count }, () => "app/one-primary");

    const findings = await connector({ maxTargets: 100 }).evaluate(
      request(ids, "x".repeat(MAX_TARGET_HTML_CHARS)),
    );
    expect(fake.asked.length).toBeGreaterThan(1);
    expect(fake.asked.flatMap((asked) => Object.keys(asked.questions))).toHaveLength(count);
    expect(findings.length).toBeGreaterThan(0);
  });

  it("rejects more elements than maxTargets, before any request", async () => {
    await expect(
      connector({ maxTargets: 1 }).evaluate(request(["app/one-primary", "app/one-primary"])),
    ).rejects.toThrow(/limit is 1/);
    expect(fake.asked).toHaveLength(0);
  });

  it("rejects a target naming an unknown rule", async () => {
    await expect(connector().evaluate(request(["nope"]))).rejects.toThrow(/no rule "nope"/);
  });

  it("rejects a response without a probability as a plain Error", async () => {
    server.use(
      http.post("https://api.typesafe.ai/v1/systemone", () =>
        HttpResponse.json({
          model: "jev-1.13.0",
          answers: { "target:0": { type: "noul" } },
          usage: {},
        }),
      ),
    );
    const failure = await connector()
      .evaluate(request(["app/one-primary"]))
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).name).not.toBe("FiberFailure");
    expect((failure as Error).message).toMatch(/could not evaluate/);
  });

  it("rejects an HTTP error with the classifier's plain error", async () => {
    fake.failNext(500, { detail: "boom" });
    const failure = await connector()
      .evaluate(request(["app/one-primary"]))
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).name).toBe("ClassifierRequestError");
    expect((failure as Error).message).toMatch(/could not evaluate/);
  });

  it("abandons a request the endpoint never answers, at its timeout", async () => {
    fake.stallNext();
    const started = Date.now();

    await expect(
      connector({ timeoutMs: 50 }).evaluate(request(["app/one-primary"])),
    ).rejects.toThrow(/could not evaluate/);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("waits longer than a keystroke by default", () => {
    expect(DEFAULT_RULES_TIMEOUT_MS).toBeGreaterThan(8000);
  });

  it("costs nothing until something is judged", () => {
    expect(() => connector({ apiKey: "" })).not.toThrow();
    expect(fake.asked).toHaveLength(0);
  });
});
