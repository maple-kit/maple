import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { pullRequestFiles } from "../src/changed-files.js";
import { runCiLint, withJudgedNotes } from "../src/ci-lint.js";
import { lint } from "../src/commands/lint.js";
import { describeJudgedStats } from "../src/judged-notes.js";
import { judgedFrom } from "../src/judged-rules.js";
import { loadLintConfig } from "../src/lint-config.js";
import { run } from "../src/run.js";

import type { RunLint } from "../src/commands/lint.js";
import type { ConnectRules } from "../src/judged-rules.js";
import type { Finding, Rule, RuleConnector } from "@maple-kit/core/connectors";
import type { JudgedStats } from "@maple-kit/lint";

const API = "https://api.github.com/repos/acme/web";
const sent: { body: { conclusion: string; output: { title: string; summary: string } } }[] = [];
let pullPages: string[][] = [];
let pullStatus = 200;
const asked: string[] = [];
const server = setupServer(
  http.post(`${API}/check-runs`, async ({ request }) => {
    sent.push({ body: (await request.json()) as (typeof sent)[number]["body"] });
    return HttpResponse.json({ id: 77 });
  }),
  http.get(`${API}/pulls/7/files`, ({ request }) => {
    const url = new URL(request.url);
    asked.push(`${url.searchParams.get("per_page") ?? ""}:${url.searchParams.get("page") ?? ""}`);
    if (pullStatus !== 200) return HttpResponse.json({ message: "no" }, { status: pullStatus });
    const page = Number(url.searchParams.get("page"));
    return HttpResponse.json(
      (pullPages[page - 1] ?? []).map((filename) =>
        filename.startsWith("-")
          ? { filename: filename.slice(1), status: "removed" }
          : { filename, status: "modified" },
      ),
    );
  }),
);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  sent.length = 0;
  asked.length = 0;
  pullPages = [];
  pullStatus = 200;
  server.resetHandlers();
});
afterAll(() => server.close());

const RULE: Rule = {
  id: "app/one-primary",
  question: "Is this a second primary button?",
  appliesTo: "button",
};

/** A directory holding `maple.lint.config.ts` with this source, or the named file. */
async function configIn(source: string, name = "maple.lint.config.ts"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maple-config-"));
  await writeFile(join(dir, name), source);
  return dir;
}

function exporting(value: unknown): string {
  return `export default ${JSON.stringify(value)};\n`;
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

const STATS: JudgedStats = {
  matched: 87,
  groups: 5,
  sent: 12,
  droppedByCap: 3,
  notChanged: 40,
  rulesAtCap: ["a", "b", "c"],
  broadRules: ["x"],
  invalidSelectors: [],
};

/** A `lint` standing in for the browser: it hands back what the options asked to judge. */
function lintJudging(
  findings: Finding[],
  judgedErrors: string[] = [],
  judgedStats?: JudgedStats,
): RunLint {
  return () => Promise.resolve({ findings, judgedErrors, ...(judgedStats ? { judgedStats } : {}) });
}

describe("loadLintConfig", () => {
  it("imports a TypeScript config with types and defineLintConfig-shaped data", async () => {
    const dir = await configIn(
      `const rules: { id: string; question: string; appliesTo: string; severity?: "error" }[] = [
  { id: "a", question: "q?", appliesTo: "button", severity: "error" },
];
export default { rules, maxTargets: 12 };
`,
    );
    expect(await loadLintConfig(undefined, dir)).toEqual({
      rules: [{ id: "a", question: "q?", appliesTo: "button", severity: "error" }],
      maxTargets: 12,
    });
  });

  it("reads the file --config names, wherever it is", async () => {
    const dir = await configIn(exporting({ rules: [RULE] }), "design.ts");
    expect((await loadLintConfig("design.ts", dir))?.rules).toEqual([RULE]);
  });

  it("is undefined when the default file is absent", async () => {
    const empty = await mkdtemp(join(tmpdir(), "maple-empty-"));
    expect(await loadLintConfig(undefined, empty)).toBeUndefined();
  });

  it.each<[string, unknown, string]>([
    ["no rules", { rules: [] }, "non-empty"],
    ["a missing question", { rules: [{ id: "a", appliesTo: "p" }] }, '"question"'],
    ["an unknown severity", { rules: [{ ...RULE, severity: "fatal" }] }, "severity"],
    ["a repeated id", { rules: [RULE, RULE] }, "twice"],
    ["a bad cap", { rules: [RULE], maxHtml: 0 }, "maxHtml"],
    ["a bare array", [RULE], "non-empty"],
  ])("rejects %s", async (_, content, message) => {
    const dir = await configIn(exporting(content));
    await expect(loadLintConfig(undefined, dir)).rejects.toThrow(message);
  });

  it("rejects a file that does not run, naming it", async () => {
    const dir = await configIn("export default (;");
    await expect(loadLintConfig(undefined, dir)).rejects.toThrow("maple.lint.config.ts");
  });

  it("names a --config file that is not there", async () => {
    await expect(loadLintConfig("nope.ts", await configIn("export default 1;"))).rejects.toThrow(
      "nope.ts: no such file",
    );
  });
});

describe("judgedFrom", () => {
  it("is off without a config file, and never asks for a key", async () => {
    const root = await mkdtemp(join(tmpdir(), "maple-empty-"));
    const setup = await judgedFrom({ root, env: {} }, () => Promise.reject(new Error("asked")));
    expect(setup).toEqual({});
  });

  it("is skipped, with the reason, when rules are given and the key is not", async () => {
    const root = await configIn(exporting({ rules: [RULE] }));
    const setup = await judgedFrom({ root, env: {} }, () => Promise.resolve(undefined));
    expect(setup.skipped).toContain("TYPESAFE_API_KEY");
    expect(setup.judged).toBeUndefined();
  });

  it("builds the judge with the file's caps", async () => {
    const root = await configIn(exporting({ rules: [RULE], maxPerRule: 3 }));
    expect((await judgedFrom({ root, env: {} }, connect)).judged).toEqual({
      connector,
      maxPerRule: 3,
    });
  });

  it("the default judge declines without a key, before it loads anything", async () => {
    const root = await configIn(exporting({ rules: [RULE] }));
    expect((await judgedFrom({ root, env: { TYPESAFE_API_KEY: "" } })).skipped).toBeDefined();
  });
});

describe("describeJudgedStats", () => {
  it("says how much was judged, what hit a cap and what to narrow", () => {
    expect(describeJudgedStats(STATS)).toEqual([
      "Judged 12 of 87 matches (5 groups); 3 rules hit the cap: a, b, c; skipped 40 unchanged",
      "Narrow `appliesTo` for: x",
    ]);
  });

  it("leaves out what did not happen, and names bad selectors", () => {
    expect(
      describeJudgedStats({
        ...STATS,
        matched: 1,
        groups: 1,
        sent: 1,
        notChanged: 0,
        rulesAtCap: ["only"],
        broadRules: [],
        invalidSelectors: ["z"],
      }),
    ).toEqual([
      "Judged 1 of 1 matches (1 group); 1 rule hit the cap: only",
      "Not a valid selector, so nothing was judged for: z",
    ]);
  });
});

describe("withJudgedNotes", () => {
  const clean = { conclusion: "success", title: "No design findings", summary: "None." } as const;

  it("leaves a verdict alone when nothing was missed", () => {
    expect(withJudgedNotes(clean, { errors: [] })).toBe(clean);
  });

  it("says which viewports were unchecked without changing the conclusion", () => {
    const verdict = withJudgedNotes(clean, { errors: ["375x812: jev 503"], skipped: "no key" });
    expect(verdict.conclusion).toBe("success");
    expect(verdict.title).toContain("judged tier unchecked");
    expect(verdict.summary).toContain("unchecked, not clean");
    expect(verdict.summary).toContain("375x812: jev 503");
    expect(verdict.summary).toContain("skipped");
  });

  it("adds what was not judged, and keeps the title and conclusion", () => {
    const verdict = withJudgedNotes(clean, { errors: [], stats: STATS });
    expect(verdict.conclusion).toBe("success");
    expect(verdict.title).toBe(clean.title);
    expect(verdict.summary).toContain("Judged 12 of 87 matches (5 groups)");
    expect(verdict.summary).toContain("Narrow `appliesTo` for: x");
  });
});

describe("pullRequestFiles", () => {
  const ref = { token: "t", owner: "acme", repo: "web", number: 7 };

  it("pages through the files and leaves out removed ones", async () => {
    const first = Array.from({ length: 100 }, (_, i) => `src/f${String(i)}.tsx`);
    pullPages = [first, ["src/last.tsx", "-src/gone.tsx"]];
    const files = await pullRequestFiles(ref);
    expect(files).toHaveLength(101);
    expect(files.at(-1)).toBe("src/last.tsx");
    expect(asked).toEqual(["100:1", "100:2"]);
  });

  it("throws when GitHub refuses", async () => {
    pullStatus = 403;
    await expect(pullRequestFiles(ref)).rejects.toThrow("403");
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

  it("publishes what was not judged and keeps the conclusion", async () => {
    const result = await runCiLint({ ...base, publish }, { lint: lintJudging([], [], STATS) });

    expect(result).toMatchObject({ conclusion: "success", judgedStats: STATS });
    expect(sent[0]?.body.output.summary).toContain(
      "Judged 12 of 87 matches (5 groups); 3 rules hit the cap: a, b, c; skipped 40 unchanged",
    );
    expect(sent[0]?.body.output.title).not.toContain("unchecked");
  });
});

describe("the lint config on the commands", () => {
  const env = { GITHUB_REPOSITORY: "acme/web", GITHUB_SHA: "abc", MAPLE_GITHUB_TOKEN: "t" };
  const args = ["--url=https://preview.test"];

  it("maple lint judges with the config's rules and prints what was missed", async () => {
    const cwd = await configIn(exporting({ rules: [RULE] }));
    let rules: readonly Rule[] = [];
    const result = await run(["lint", ...args], {
      version: "0",
      env: {},
      cwd,
      connect: (given) => {
        rules = given;
        return Promise.resolve(connector);
      },
      lint: lintJudging([judgedFinding()], ["768x1024: judge timed out"], STATS),
    });

    expect(rules).toEqual([RULE]);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("app/one-primary");
    expect(result.output).toContain("unchecked, not clean: 768x1024: judge timed out");
    expect(result.output).toContain("Judged 12 of 87 matches (5 groups)");
    expect(result.output).toContain("Narrow `appliesTo` for: x");
  });

  it("maple lint reads --config from a path", async () => {
    const cwd = await configIn(exporting({ rules: [RULE] }), "other.config.ts");
    const result = await run(["lint", ...args, "--config=other.config.ts"], {
      version: "0",
      env: {},
      cwd,
      connect,
      lint: lintJudging([judgedFinding()]),
    });
    expect(result.output).toContain("app/one-primary");
  });

  it("maple lint is an error when rules are given and the key is not", async () => {
    const cwd = await configIn(exporting({ rules: [RULE] }));
    const result = await run(["lint", ...args], {
      version: "0",
      env: {},
      cwd,
      lint: lintJudging([]),
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("TYPESAFE_API_KEY");
  });

  it("maple lint is off, and unchanged, without a config file", async () => {
    let judged: unknown = "untouched";
    await run(["lint", ...args], {
      version: "0",
      env: {},
      cwd: await mkdtemp(join(tmpdir(), "maple-empty-")),
      lint: (options) => {
        judged = options.judged;
        return Promise.resolve({ findings: [] });
      },
    });
    expect(judged).toBeUndefined();
  });

  it("maple lint reports a broken config as an error", async () => {
    const cwd = await configIn("export default {};");
    const result = await run(["lint", ...args], {
      version: "0",
      env: {},
      cwd,
      lint: lintJudging([]),
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("maple.lint.config.ts");
  });

  it("maple lint no longer takes --rules", async () => {
    const result = await run(["lint", ...args, "--rules=x.json"], { version: "0" });
    expect(result.exitCode).toBe(1);
  });

  it("maple lint --changed passes the changed files, from origin/main by default", async () => {
    const cwd = await configIn(exporting({ rules: [RULE] }));
    const bases: string[] = [];
    let sources: unknown;
    const result = await lint(
      { positionals: [], flags: { url: "https://preview.test", changed: "" } },
      (options) => {
        sources = options.judged?.sources;
        return Promise.resolve({ findings: [] });
      },
      cwd,
      {
        env: {},
        connect,
        changedFiles: (base) => {
          bases.push(base);
          return Promise.resolve(["src/Form.tsx"]);
        },
      },
    );

    expect(result.exitCode).toBe(0);
    expect(bases).toEqual(["origin/main"]);
    expect(sources).toEqual(["src/Form.tsx"]);
  });

  it("maple lint --changed=<base> uses that base, and is off without the flag", async () => {
    const cwd = await configIn(exporting({ rules: [RULE] }));
    const bases: string[] = [];
    const seen: unknown[] = [];
    const deps = {
      env: {},
      connect,
      changedFiles: (base: string) => {
        bases.push(base);
        return Promise.resolve([]);
      },
    };
    const lintOf: RunLint = (options) => {
      seen.push(options.judged?.sources);
      return Promise.resolve({ findings: [] });
    };
    await lint(
      { positionals: [], flags: { url: "https://preview.test", changed: "origin/dev" } },
      lintOf,
      cwd,
      deps,
    );
    await lint({ positionals: [], flags: { url: "https://preview.test" } }, lintOf, cwd, deps);

    expect(bases).toEqual(["origin/dev"]);
    expect(seen).toEqual([[], undefined]);
  });

  it("maple ci lint skips the tier without a key and says so, never crashing", async () => {
    const cwd = await configIn(exporting({ rules: [RULE] }));
    const result = await run(["ci", "lint", ...args], {
      version: "0",
      env,
      cwd,
      lint: lintJudging([]),
    });

    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Judged tier skipped");
    expect(sent[0]?.body.output.summary).toContain("Judged tier: skipped");
  });

  it("maple ci lint judges when it has the key, and a judged error blocks", async () => {
    const cwd = await configIn(exporting({ rules: [{ ...RULE, severity: "error" }] }));
    const result = await run(["ci", "lint", ...args], {
      version: "0",
      env: { ...env, TYPESAFE_API_KEY: "k" },
      cwd,
      connect,
      lint: lintJudging([judgedFinding({ severity: "error" })]),
    });

    expect(result.exitCode).toBe(1);
    expect(sent[0]?.body.conclusion).toBe("failure");
  });

  it("maple ci lint fails on a broken config", async () => {
    const cwd = await configIn(exporting({ rules: [] }));
    const result = await run(["ci", "lint", ...args], {
      version: "0",
      env,
      cwd,
      lint: lintJudging([]),
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("non-empty");
    expect(sent).toHaveLength(0);
  });

  describe("on a pull request", () => {
    async function pullEvent(): Promise<string> {
      const dir = await mkdtemp(join(tmpdir(), "maple-event-"));
      const path = join(dir, "event.json");
      await writeFile(path, JSON.stringify({ pull_request: { number: 7, head: { sha: "abc" } } }));
      return path;
    }

    it("judges the PR's changed files first", async () => {
      pullPages = [["src/Form.tsx", "-src/old.tsx"]];
      const cwd = await configIn(exporting({ rules: [RULE] }));
      let sources: unknown;
      const result = await run(["ci", "lint", ...args], {
        version: "0",
        env: { ...env, TYPESAFE_API_KEY: "k", GITHUB_EVENT_PATH: await pullEvent() },
        cwd,
        connect,
        lint: (options) => {
          sources = options.judged?.sources;
          return Promise.resolve({ findings: [] });
        },
      });

      expect(result.exitCode).toBe(0);
      expect(sources).toEqual(["src/Form.tsx"]);
      expect(sent[0]?.body.output.summary).not.toContain("not narrowed");
    });

    it("warns and judges without the filter when GitHub refuses", async () => {
      pullStatus = 500;
      const cwd = await configIn(exporting({ rules: [RULE] }));
      let sources: unknown = "untouched";
      const result = await run(["ci", "lint", ...args], {
        version: "0",
        env: { ...env, TYPESAFE_API_KEY: "k", GITHUB_EVENT_PATH: await pullEvent() },
        cwd,
        connect,
        lint: (options) => {
          sources = options.judged?.sources;
          return Promise.resolve({ findings: [] });
        },
      });

      expect(result.exitCode).toBe(0);
      expect(sources).toBeUndefined();
      expect(result.output).toContain("could not be read (GitHub answered 500)");
      expect(sent[0]?.body.output.summary).toContain("not narrowed to changed files");
    });

    it("does not ask GitHub when the judged tier is off", async () => {
      const cwd = await mkdtemp(join(tmpdir(), "maple-empty-"));
      await run(["ci", "lint", ...args], {
        version: "0",
        env: { ...env, GITHUB_EVENT_PATH: await pullEvent() },
        cwd,
        lint: lintJudging([]),
      });
      expect(asked).toEqual([]);
    });
  });
});
