/**
 * LaunchDarkly's Node server SDK, as a hook that reports each flag it
 * evaluates to `recordFlagUse`. Typed structurally: the SDK is not imported.
 */

import { recordFlagUse } from "../flags/index.js";

/** The part of the SDK's `EvaluationSeriesContext` this reads. */
export interface FlagUseHookContext {
  readonly flagKey: string;
}

/** A hook as `LDClient`'s `hooks` option takes it. */
export interface FlagUseHook {
  getMetadata(): { readonly name: string };
  afterEvaluation(
    context: FlagUseHookContext,
    data: Readonly<Record<string, unknown>>,
    detail: unknown,
  ): Readonly<Record<string, unknown>>;
}

/** Add to `options.hooks`, or `client.addHook`, so every evaluation is recorded. */
export function launchDarklyFlagUse(): FlagUseHook {
  return {
    getMetadata: () => ({ name: "maple-flag-use" }),
    afterEvaluation(context, data) {
      recordFlagUse(context.flagKey);
      return data;
    },
  };
}
