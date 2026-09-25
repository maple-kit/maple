/**
 * The shared contract for a flag provider under `withMockFlags`.
 *
 * Every provider Maple wraps runs this suite. It asserts what a page relies
 * on: a flag the recipe names answers the recipe's value, every other flag the
 * provider's own, and a change to a named flag is never heard.
 */

import { describe, expect, it } from "vitest";

import { seenFlags } from "../flags.js";
import { MOCK_VARIANT, withMockFlags } from "../openfeature/index.js";

import type { FlagProvider, Resolution } from "../openfeature/index.js";
import type { FlagValue, Recipe } from "@maple-kit/core/mock";

/** What the suite needs in order to exercise a provider. */
export interface FlagProviderContractOptions {
  /** Shown in the test names, e.g. "memory". */
  readonly name: string;
  /** A provider holding `flags`, and a switch that changes them. Called once per test. */
  create(flags: Readonly<Record<string, FlagValue>>): Promise<FlagProviderContractSubject>;
}

/** A provider plus the switch the suite flips, which must emit the provider's own change. */
export interface FlagProviderContractSubject {
  readonly provider: FlagProvider;
  change(flags: Readonly<Record<string, FlagValue>>): Promise<void>;
}

const REAL = { beta: false, tier: "bronze", limit: 3, banner: { text: "hi" } };
const MOCKED = { beta: true, tier: "gold", limit: 50, banner: { text: "mocked" } };
const TYPES = [
  ["resolveBooleanEvaluation", "beta", true],
  ["resolveStringEvaluation", "tier", "none"],
  ["resolveNumberEvaluation", "limit", 0],
  ["resolveObjectEvaluation", "banner", {}],
] as const;

type Method = (typeof TYPES)[number][0];
type Evaluate = (key: string, fallback: unknown, context: object, logger: object) => unknown;
type Heard = (details?: { flagsChanged?: readonly string[] }) => unknown;

async function evaluate(
  provider: FlagProvider,
  [method, key, fallback]: [Method, string, unknown],
) {
  const resolve = provider[method] as unknown as Evaluate;
  return (await resolve.call(provider, key, fallback, {}, {})) as Resolution<FlagValue>;
}

function flagsOf(flags: Recipe["flags"]): Recipe {
  return { version: 2, calls: [], ...(flags === undefined ? {} : { flags }) };
}

/** Runs the contract against a provider. */
export function runFlagProviderContract(options: FlagProviderContractOptions): void {
  describe(`${options.name} flag provider, under withMockFlags`, () => {
    let recipe: Recipe | undefined;
    const wrap = async () => {
      const subject = await options.create(REAL);
      return { ...subject, provider: withMockFlags(subject.provider, { recipe: () => recipe }) };
    };

    it.each(TYPES)("answers %s with its own value for a flag no recipe names", async (...row) => {
      recipe = flagsOf({ other: true });
      const { provider } = await wrap();
      expect((await evaluate(provider, row)).value).toEqual(REAL[row[1]]);
    });

    it.each(TYPES)("answers %s with the recipe's value for a flag it names", async (...row) => {
      recipe = flagsOf(MOCKED);
      const { provider } = await wrap();
      const answer = await evaluate(provider, row);
      expect(answer).toMatchObject({ value: MOCKED[row[1]], variant: MOCK_VARIANT });
      expect(answer.errorCode).toBeUndefined();
    });

    it("says a value of the wrong type is one, as a provider would", async () => {
      recipe = flagsOf({ beta: "yes" });
      const { provider } = await wrap();
      const answer = await evaluate(provider, ["resolveBooleanEvaluation", "beta", false]);
      expect(answer).toMatchObject({ errorCode: "TYPE_MISMATCH" });
    });

    it("records each flag it evaluates with its real value, never the mocked one", async () => {
      recipe = flagsOf({ tier: "gold" });
      const { provider } = await wrap();
      await evaluate(provider, ["resolveStringEvaluation", "tier", "none"]);
      expect(
        seenFlags()
          .list()
          .find((flag) => flag.key === "tier"),
      ).toEqual({
        key: "tier",
        type: "string",
        value: "bronze",
      });
    });

    it("holds back a change to a flag the recipe names, and passes on the rest", async () => {
      recipe = flagsOf({ beta: true });
      const subject = await wrap();
      const heard: (readonly string[] | undefined)[] = [];
      const handler: Heard = (details) => heard.push(details?.flagsChanged);
      subject.provider.events?.addHandler("PROVIDER_CONFIGURATION_CHANGED", handler);

      await subject.change({ beta: false });
      await subject.change({ beta: false, tier: "silver" });
      expect(heard).toEqual([["tier"]]);

      subject.provider.events?.removeHandler("PROVIDER_CONFIGURATION_CHANGED", handler);
      await subject.change({ tier: "gold" });
      expect(heard).toHaveLength(1);
    });
  });
}
