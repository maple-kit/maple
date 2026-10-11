/**
 * The judged lint tier as the command line wires it: the lint config file, jev
 * as the judge, and the key from the environment.
 *
 * No config file means no judged tier. Rules without a key are `skipped`, which
 * `maple lint` reports as an error and `maple ci lint` notes in its summary.
 */

import { loadLintConfig } from "./lint-config.js";

import type { Rule, RuleConnector } from "@maple-kit/core/connectors";
import type { JudgedOptions } from "@maple-kit/lint";

/** Builds the judge from the rules and the environment. Tests supply a fake. */
export type ConnectRules = (
  rules: readonly Rule[],
  env: NodeJS.ProcessEnv,
) => Promise<RuleConnector | undefined>;

/** What the config resolved to. Neither field set is a run without the judged tier. */
export interface JudgedSetup {
  readonly judged?: JudgedOptions;
  /** Why the tier did not run although rules were given. */
  readonly skipped?: string;
}

/** jev, loaded only when rules are given, so the classifier's peers matter only then. */
export const connectJev: ConnectRules = async (rules, env) => {
  const apiKey = env["TYPESAFE_API_KEY"];
  if (apiKey === undefined || apiKey === "") return undefined;
  let classifier: typeof import("@maple-kit/classifier");
  try {
    classifier = await import("@maple-kit/classifier");
  } catch {
    throw new Error(
      "the judged tier needs @maple-kit/classifier and its peers (effect, @effect/ai-typesafe); install them next to @maple-kit/cli.",
    );
  }
  const model = env["MAPLE_AI_MODEL"];
  const baseUrl = env["MAPLE_AI_API"];
  return classifier.jevRules({
    apiKey,
    rules,
    ...(model === undefined || model === "" ? {} : { model }),
    ...(baseUrl === undefined || baseUrl === "" ? {} : { baseUrl }),
  });
};

/** What the judged tier reads from outside. */
export interface JudgedInputs {
  /** `--config`; the default file is used when omitted. */
  readonly config?: string | undefined;
  /** Where the default config is looked for. */
  readonly root: string;
  readonly env: NodeJS.ProcessEnv;
}

/** Resolves the config file into the judged tier, or into the reason it is off. */
export async function judgedFrom(
  { config, root, env }: JudgedInputs,
  connect: ConnectRules = connectJev,
): Promise<JudgedSetup> {
  const loaded = await loadLintConfig(config, root);
  if (loaded === undefined) return {};
  const { rules, ...caps } = loaded;
  const connector = await connect(rules, env);
  if (connector === undefined) {
    return { skipped: "TYPESAFE_API_KEY is not set, so the lint config's rules were not judged." };
  }
  return { judged: { connector, ...caps } };
}
