import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { runCiLint, withJudgedNotes } from "../src/ci-lint.js";
import { judgedFrom, readRulesFile } from "../src/judged-rules.js";
import { run } from "../src/run.js";

import type { RunLint } from "../src/commands/lint.js";
import type { ConnectRules } from "../src/judged-rules.js";
import type { Finding, Rule, RuleConnector } from "@maple-kit/core/connectors";

const API = "https://api.github.com/repos/acme/web";
const sent: { body: { conclusion: string; output: { title: string; summary: string } } }[] = [];
const server = setupServer(
  http.post(`${API}/check-runs`, async ({ request }) => {
    sent.push({ body: (await request.json()) as (typeof sent)[number]["body"] });
    return HttpResponse.json({ id: 77 });
  }),
);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  sent.length = 0;
  server.resetHandlers();
});
afterAll(() => server.close());

const RULE: Rule = {
  id: "app/one-primary",
  question: "Is this a second primary button?",
  appliesTo: "button",
};

async function rulesFile(content: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maple-rules-"));
  const path = join(dir, "rules.json");
  await writeFile(path, typeof content === "string" ? content : JSON.stringify(content));
  return path;
}

function judgedFinding(over: Partial<Finding> = {}): Finding {
  return {
    rule: RULE.id,
    tier: "judged",
    severity: "advice",
    message: "A second primary button.",
    anchor: { source: "src/Form.tsx:9:5" },
    ...over,
  };
}

const connector: RuleConnector = {
  name: "fake",
  rules: [RULE],
  evaluate: () => Promise.resolve([]),
};
const connect: ConnectRules = () => Promise.resolve(connector);

/** A `lint` standing in for the browser: it hands back what the options asked to judge. */
function lintJudging(findings: Finding[], judgedErrors: string[] = []): RunLint {
  return () => Promise.resolve({ findings, judgedErrors });
}

describe("readRulesFile", () => {
  it("reads an object with caps, and a bare array", async () => {
    const full = await readRulesFile(
      await rulesFile({ rules: [{ ...RULE, severity: "error" }], maxTargets: 12 }),
    );
    expect(full.rules).toEqual([{ ...RULE, severity: "error" }]);
    expect(full.caps).toEqual({ maxTargets: 12 });

    expect((await readRulesFile(await rulesFile([RULE]))).rules).toEqual([RULE]);
  });

  it.each<[string, unknown, string]>([
    ["no rules", { rules: [] }, "non-empty"],
    ["a missing question", { rules: [{ id: "a", appliesTo: "p" }] }, '"question"'],
    ["an unknown severity", { rules: [{ ...RULE, severity: "fatal" }] }, "severity"],
    ["a repeated id", { rules: [RULE, RULE] }, "twice"],
    ["a bad cap", { rules: [RULE], maxHtml: 0 }, "maxHtml"],
    ["not JSON", "{", "--rules"],
  ])("rejects %s", async (_, content, message) => {
    await expect(readRulesFile(await rulesFile(content))).rejects.toThrow(message);
  });

  it("names a file that is not there", async () => {
    await expect(readRulesFile("/nonexistent/rules.json")).rejects.toThrow("--rules");
  });
});

describe("judgedFrom", () => {
  it("is off without a rules file, and never asks for a key", async () => {
    expect(await judgedFrom(undefined, {}, () => Promise.reject(new Error("asked")))).toEqual({});
  });

  it("is skipped, with the reason, when rules are given and the key is not", async () => {
    const path = await rulesFile([RULE]);
    const setup = await judgedFrom(path, {}, () => Promise.resolve(undefined));
    expect(setup.skipped).toContain("TYPESAFE_API_KEY");
    expect(setup.judged).toBeUndefined();
  });

  it("builds the judge with the file's caps", async () => {
    const path = await rulesFile({ rules: [RULE], maxPerRule: 3 });
    expect((await judgedFrom(path, {}, connect)).judged).toEqual({ connector, maxPerRule: 3 });
  });

  it("the default judge declines without a key, before it loads anything", async () => {
    const path = await rulesFile([RULE]);
    expect((await judgedFrom(path, { TYPESAFE_API_KEY: "" })).skipped).toBeDefined();
  });
});

describe("withJudgedNotes", () => {
  const clean = { conclusion: "success", title: "No design findings", summary: "None." } as const;

  it("leaves a verdict alone when nothing was missed", () => {
    expect(withJudgedNotes(clean, [])).toBe(clean);
  });

  it("says which viewports were unchecked without changing the conclusion", () => {
    const verdict = withJudgedNotes(clean, ["375x812: jev 503"], "no key");
    expect(verdict.conclusion).toBe("success");
    expect(verdict.title).toContain("judged tier unchecked");
    expect(verdict.summary).toContain("unchecked, not clean");
    expect(verdict.summary).toContain("375x812: jev 503");
    expect(verdict.summary).toContain("skipped");
  });
});

describe("runCiLint with the judged tier", () => {
  const base = { url: "https://preview.test", tokenFiles: [] };
  const publish = { token: "t", owner: "acme", repo: "web", headSha: "abc" };

  it("passes the judge through to the lint", async () => {
    let seen: unknown;
    await runCiLint(
      { ...base, judged: { connector } },
      {
        lint: (options) => {
          seen = options.judged;
          return Promise.resolve({ findings: [] });
        },
      },
    );
    expect(seen).toEqual({ connector });
  });

  it("does not block on advice, and blocks on a judged error", async () => {
    const advice = await runCiLint(base, { lint: lintJudging([judgedFinding()]) });
    const error = await runCiLint(base, {
      lint: lintJudging([judgedFinding({ severity: "error" })]),
    });
    expect([advice.conclusion, error.conclusion]).toEqual(["success", "failure"]);
  });

  it("publishes the unchecked viewports in the summary and still succeeds", async () => {
    const result = await runCiLint(
      { ...base, publish },
      { lint: lintJudging([], ["375x812: jev answered 503"]) },
    );

    expect(result).toMatchObject({
      conclusion: "success",
      judgedErrors: ["375x812: jev answered 503"],
    });
    expect(sent[0]?.body.output.summary).toContain("375x812: jev answered 503");
    expect(sent[0]?.body.output.title).toContain("judged tier unchecked");
  });

  it("notes a skipped tier in the summary", async () => {
    const result = await runCiLint(
      { ...base, publish, judgedSkipped: "TYPESAFE_API_KEY is not set" },
      { lint: lintJudging([]) },
    );

    expect(result.judgedSkipped).toBe("TYPESAFE_API_KEY is not set");
    expect(sent[0]?.body.output.summary).toContain("Judged tier: skipped");
  });
});

describe("--rules on the commands", () => {
  const env = { GITHUB_REPOSITORY: "acme/web", GITHUB_SHA: "abc", MAPLE_GITHUB_TOKEN: "t" };

  it("maple lint judges with the file's rules and prints unchecked viewports", async () => {
    const path = await rulesFile([RULE]);
    let rules: readonly Rule[] = [];
    const result = await run(["lint", "--url=https://preview.test", `--rules=${path}`], {
      version: "0",
      env: {},
      connect: (given) => {
        rules = given;
        return Promise.resolve(connector);
      },
      lint: lintJudging([judgedFinding()], ["768x1024: judge timed out"]),
    });

    expect(rules).toEqual([RULE]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("app/one-primary");
    expect(result.output).toContain("unchecked, not clean: 768x1024: judge timed out");
  });

  it("maple lint is an error when rules are given and the key is not", async () => {
    const path = await rulesFile([RULE]);
    const result = await run(["lint", "--url=https://preview.test", `--rules=${path}`], {
      version: "0",
      env: {},
      lint: lintJudging([]),
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("TYPESAFE_API_KEY");
  });

  it("maple lint is off, and unchanged, without --rules", async () => {
    let judged: unknown = "untouched";
    await run(["lint", "--url=https://preview.test"], {
      version: "0",
      env: {},
      lint: (options) => {
        judged = options.judged;
        return Promise.resolve({ findings: [] });
      },
    });
    expect(judged).toBeUndefined();
  });

  it("maple lint reports an unreadable rules file as an error", async () => {
    const path = await rulesFile("{");
    const result = await run(["lint", "--url=https://preview.test", `--rules=${path}`], {
      version: "0",
      env: {},
      lint: lintJudging([]),
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("--rules");
  });

  it("maple ci lint skips the tier without a key and says so, never crashing", async () => {
    const path = await rulesFile([RULE]);
    const result = await run(["ci", "lint", "--url=https://preview.test", `--rules=${path}`], {
      version: "0",
      env,
      lint: lintJudging([]),
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Judged tier skipped");
    expect(sent[0]?.body.output.summary).toContain("Judged tier: skipped");
  });

  it("maple ci lint judges when it has the key, and a judged error blocks", async () => {
    const path = await rulesFile([{ ...RULE, severity: "error" }]);
    const result = await run(["ci", "lint", "--url=https://preview.test", `--rules=${path}`], {
      version: "0",
      env: { ...env, TYPESAFE_API_KEY: "k" },
      connect,
      lint: lintJudging([judgedFinding({ severity: "error" })]),
    });

    expect(result.exitCode).toBe(1);
    expect(sent[0]?.body.conclusion).toBe("failure");
  });
});
