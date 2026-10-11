/**
 * The shared rules-connector contract.
 *
 * Every rules connector runs this suite. It asserts what a host relies on to
 * place a judged finding on a page: that it names a rule the connector
 * declared, that it is marked judged, that it points at an element the host
 * sent, and that a failure is a plain Error rather than an Effect's.
 */

import { describe, expect, it } from "vitest";

import type { Finding, RuleConnector, RuleRequest, RuleTarget } from "../connectors/types.js";

/** What the suite needs in order to exercise a connector. */
export interface RulesContractOptions {
  /** Shown in the test names, e.g. "memory". */
  readonly name: string;
  /** Builds an isolated connector. Called once per test. */
  readonly create: () => Promise<RulesContractSubject>;
  /** Builds one whose `evaluate` always fails. Without it the failure test is skipped. */
  readonly createFailing?: () => Promise<RulesContractSubject>;
  /** Elements the connector is known to flag, for the tests that need a finding. */
  readonly violating?: readonly RuleTarget[];
}

/** A connector plus whatever is needed to tear it down. */
export interface RulesContractSubject {
  readonly connector: RuleConnector;
  cleanup?(): Promise<void>;
}

const PAGE = { url: "https://preview.test/", viewport: { width: 1280, height: 800 } };

/** A request over `targets`, on a page nobody will ever fetch. */
function requestOf(targets: readonly RuleTarget[]): RuleRequest {
  return { ...PAGE, targets };
}

/** One element per declared rule, each with an anchor of its own. */
function targetsFor(connector: RuleConnector): RuleTarget[] {
  return connector.rules.map((rule, index) => ({
    rule: rule.id,
    html: `<div class="contract-${index}">x</div>`,
    anchor: { selector: `#contract-${index}` },
  }));
}

/** Runs the whole contract against one connector. */
export function runRulesContract(options: RulesContractOptions): void {
  describe(`rules contract: ${options.name}`, () => {
    /** Runs `body` against a fresh connector and always cleans up. */
    async function withSubject(
      body: (connector: RuleConnector) => Promise<void>,
      create: () => Promise<RulesContractSubject> = options.create,
    ): Promise<void> {
      const subject = await create();
      try {
        await body(subject.connector);
      } finally {
        await subject.cleanup?.();
      }
    }

    /** Findings for the violating targets, or the declared rules' own elements. */
    async function evaluated(connector: RuleConnector): Promise<{
      targets: readonly RuleTarget[];
      findings: readonly Finding[];
    }> {
      const targets = options.violating ?? targetsFor(connector);
      return { targets, findings: await connector.evaluate(requestOf(targets)) };
    }

    it("has a name", async () => {
      await withSubject((connector) => {
        expect(connector.name).toMatch(/\S/);
        return Promise.resolve();
      });
    });

    it("declares rules with distinct ids", async () => {
      await withSubject((connector) => {
        const ids = connector.rules.map((rule) => rule.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const rule of connector.rules) {
          expect(rule.id).toMatch(/\S/);
          expect(rule.question).toMatch(/\S/);
          expect(rule.appliesTo).toMatch(/\S/);
        }
        return Promise.resolve();
      });
    });

    it("finds nothing on a page with no targets", async () => {
      await withSubject(async (connector) => {
        expect(await connector.evaluate(requestOf([]))).toEqual([]);
      });
    });

    it("reports only rules it declares", async () => {
      await withSubject(async (connector) => {
        const declared = new Set(connector.rules.map((rule) => rule.id));
        const { findings } = await evaluated(connector);
        for (const finding of findings) expect(declared.has(finding.rule)).toBe(true);
      });
    });

    it("says nothing about a rule it was never given", async () => {
      await withSubject(async (connector) => {
        const stranger: RuleTarget = {
          rule: "contract/undeclared",
          html: "<p>x</p>",
          anchor: { selector: "#stranger" },
        };
        const findings = await connector.evaluate(requestOf([stranger]));
        expect(findings.filter((finding) => finding.rule === stranger.rule)).toEqual([]);
      });
    });

    it("marks every finding judged, with a message and a severity", async () => {
      await withSubject(async (connector) => {
        const { findings } = await evaluated(connector);
        for (const finding of findings) {
          const rule = connector.rules.find((candidate) => candidate.id === finding.rule);
          expect(finding.tier).toBe("judged");
          expect(finding.message).toMatch(/\S/);
          expect(finding.severity).toBe(rule?.severity ?? "advice");
        }
      });
    });

    it("anchors every finding on an element it was sent", async () => {
      await withSubject(async (connector) => {
        const { targets, findings } = await evaluated(connector);
        for (const finding of findings) {
          const sent = targets.filter((target) => target.rule === finding.rule);
          expect(sent.map((target) => target.anchor)).toContainEqual(finding.anchor);
        }
      });
    });

    if (options.violating?.length) {
      it("flags the elements it is known to flag", async () => {
        await withSubject(async (connector) => {
          const { findings } = await evaluated(connector);
          expect(findings.length).toBeGreaterThan(0);
        });
      });
    }

    it("does not change the request it was given", async () => {
      await withSubject(async (connector) => {
        const targets = options.violating ?? targetsFor(connector);
        const before = structuredClone(targets);
        await connector.evaluate(requestOf(targets));
        expect(targets).toEqual(before);
      });
    });

    const { createFailing } = options;
    if (createFailing) {
      it("rejects with a plain Error when it cannot judge", async () => {
        await withSubject(async (connector) => {
          const failure: unknown = await connector
            .evaluate(requestOf(options.violating ?? targetsFor(connector)))
            .then(
              () => undefined,
              (error: unknown) => error,
            );
          expect(failure).toBeInstanceOf(Error);
          expect((failure as Error).name).not.toBe("FiberFailure");
        }, createFailing);
      });
    }
  });
}
