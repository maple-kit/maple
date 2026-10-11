import { SAMPLE_CONTEXT } from "@maple-kit/core/testing";
import { describe, expect, it } from "vitest";

import { dedupe } from "../src/rendered/audit.js";
import { lintJudged } from "../src/rendered/judged.js";

import type { Targets } from "../src/rendered/collect.js";
import type { Finding, Rule, RuleConnector, RuleRequest } from "@maple-kit/core/connectors";

const RULES: readonly Rule[] = [
  { id: "acme/one-primary", question: "Is there one primary button?", appliesTo: "form" },
  { id: "acme/tone", question: "Is the copy calm?", appliesTo: "p", severity: "warn" },
];
const STATS = {
  matched: 1,
  groups: 1,
  sent: 1,
  droppedByCap: 0,
  notChanged: 0,
  rulesAtCap: [],
  broadRules: [],
  invalidSelectors: [],
};
const JUDGED: Targets = {
  targets: [{ rule: "acme/tone", html: "<p>HURRY</p>", anchor: { selector: "p" } }],
  repeats: [0],
  stats: STATS,
};
const PAGE = {
  url: "https://preview.example.app",
  viewport: { width: 375, height: 812 },
  judged: JUDGED,
};

function found(over: Partial<Finding> = {}): Finding {
  return {
    rule: "acme/tone",
    tier: "rendered",
    severity: "error",
    message: "Shouty.",
    anchor: { selector: "p" },
    ...over,
  };
}

/** A local fake: answers with what it is told to, and remembers each request. */
function fake(answer: () => Promise<readonly Finding[]>) {
  const requests: RuleRequest[] = [];
  const connector: RuleConnector = {
    name: "fake",
    rules: RULES,
    evaluate: (request) => {
      requests.push(request);
      return answer();
    },
  };
  return { connector, requests };
}

describe("lintJudged", () => {
  it("asks once with the page, the viewport and the targets", async () => {
    const { connector, requests } = fake(() => Promise.resolve([]));
    await lintJudged(connector, PAGE);
    expect(requests).toEqual([
      { url: PAGE.url, viewport: PAGE.viewport, targets: PAGE.judged.targets },
    ]);
  });

  it("does not ask when no element matched", async () => {
    const { connector, requests } = fake(() => Promise.resolve([]));
    const empty = { ...PAGE, judged: { ...JUDGED, targets: [], repeats: [] } };
    expect(await lintJudged(connector, empty)).toEqual({ findings: [] });
    expect(requests).toHaveLength(0);
  });

  it("makes every finding judged, at its rule's severity", async () => {
    const { connector } = fake(() => Promise.resolve([found()]));
    const result = await lintJudged(connector, PAGE);
    expect(result.findings).toEqual([found({ tier: "judged", severity: "warn" })]);
  });

  it("defaults to advice when the rule names no severity", async () => {
    const { connector } = fake(() => Promise.resolve([found({ rule: "acme/one-primary" })]));
    const result = await lintJudged(connector, PAGE);
    expect(result.findings[0]?.severity).toBe("advice");
  });

  it("drops a finding for a rule the connector does not own", async () => {
    const { connector } = fake(() => Promise.resolve([found({ rule: "acme/invented" })]));
    expect((await lintJudged(connector, PAGE)).findings).toEqual([]);
  });

  it.each([
    ["an Error", () => Promise.reject(new Error("timed out")), "timed out"],
    ["a string", () => Promise.reject(new TypeError("rate limited")), "rate limited"],
  ])("returns an error rather than throwing on %s", async (_name, answer, message) => {
    const { connector } = fake(answer);
    expect(await lintJudged(connector, PAGE)).toEqual({ findings: [], error: message });
  });
});

describe("repeated instances", () => {
  const shared = (repeats: number) => ({ ...PAGE, judged: { ...JUDGED, repeats: [repeats] } });

  it.each([
    [12, "Shouty. (and 12 identical instances)"],
    [1, "Shouty. (and 1 identical instance)"],
    [0, "Shouty."],
  ])("with %i others, the message is %s", async (repeats, message) => {
    const { connector } = fake(() => Promise.resolve([found()]));
    const result = await lintJudged(connector, shared(repeats));
    expect(result.findings.map((one) => one.message)).toEqual([message]);
  });

  it("does not touch a finding on another element", async () => {
    const other = found({ anchor: { selector: "section > p" } });
    const { connector } = fake(() => Promise.resolve([other]));
    const result = await lintJudged(connector, shared(5));
    expect(result.findings[0]?.message).toBe("Shouty.");
  });

  it("matches by source when no selector is given", async () => {
    const anchor = { source: "a.tsx:1:1" };
    const page = {
      ...PAGE,
      judged: {
        ...JUDGED,
        targets: [{ rule: "acme/tone", html: "<p>x</p>", anchor }],
        repeats: [3],
      },
    };
    const { connector } = fake(() => Promise.resolve([found({ anchor })]));
    expect((await lintJudged(connector, page)).findings[0]?.message).toContain("and 3 identical");
  });
});

describe("dedupe of judged findings", () => {
  const judged = (message: string) => found({ tier: "judged", severity: "advice", message });
  const pass = (width: number, findings: readonly Finding[]) => ({
    viewport: { width, height: 800 },
    findings,
    context: SAMPLE_CONTEXT,
    unreadable: [],
  });

  it("treats different wording at two viewports as one finding", () => {
    const seen = dedupe([pass(375, [judged("Too loud.")]), pass(1440, [judged("Shouty copy.")])]);
    expect(seen).toHaveLength(1);
  });

  it("still tells two rendered messages apart", () => {
    const seen = dedupe([pass(375, [found({ message: "a" }), found({ message: "b" })])]);
    expect(seen).toHaveLength(2);
  });
});
