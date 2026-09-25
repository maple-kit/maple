import { withMockFlags } from "@maple-kit/mock/openfeature";
import { memoryFlagProvider, runFlagProviderContract } from "@maple-kit/mock/testing";
import {
  OpenFeature as ServerFeature,
  TypedInMemoryProvider as ServerMemoryProvider,
} from "@openfeature/server-sdk";
import { OpenFeature, TypedInMemoryProvider } from "@openfeature/web-sdk";
import { afterEach, describe, expect, it } from "vitest";

import type { Recipe } from "@maple-kit/core/mock";

type Json = boolean | number | string | { readonly [key: string]: Json };

runFlagProviderContract({
  name: "memory, answering at once",
  create: (flags) => {
    const provider = memoryFlagProvider(flags);
    return Promise.resolve({ provider, change: (next) => Promise.resolve(provider.change(next)) });
  },
});

runFlagProviderContract({
  name: "memory, answering in a promise",
  create: (flags) => {
    const provider = memoryFlagProvider(flags, { async: true });
    return Promise.resolve({ provider, change: (next) => Promise.resolve(provider.change(next)) });
  },
});

/** OpenFeature's own in-memory configuration: one variant per value, on by default. */
function configuration(flags: Readonly<Record<string, Json>>) {
  return Object.fromEntries(
    Object.entries(flags).map(([key, value]) => [
      key,
      { variants: { on: value }, defaultVariant: "on" as const, disabled: false },
    ]),
  );
}

const RECIPE: Recipe = { version: 2, calls: [], flags: { "new-roaster": true } };

afterEach(async () => {
  await OpenFeature.clearProviders();
  await ServerFeature.clearProviders();
});

describe("withMockFlags under OpenFeature's own SDKs", () => {
  it("answers a web client's evaluation, and holds back the provider's change to it", async () => {
    const real = new TypedInMemoryProvider(configuration({ "new-roaster": false, tier: "bronze" }));
    await OpenFeature.setProviderAndWait(withMockFlags(real, { recipe: () => RECIPE }));
    const client = OpenFeature.getClient();
    const heard: (readonly string[] | undefined)[] = [];
    client.addHandler("PROVIDER_CONFIGURATION_CHANGED" as never, (details) => {
      heard.push((details as { flagsChanged?: string[] } | undefined)?.flagsChanged);
    });

    expect(client.getBooleanDetails("new-roaster", false)).toMatchObject({
      value: true,
      variant: "maple-mock",
    });
    expect(client.getStringValue("tier", "none")).toBe("bronze");

    await real.putConfiguration(configuration({ "new-roaster": false, tier: "silver" }));
    expect(heard.flat()).not.toContain("new-roaster");
    expect(client.getBooleanValue("new-roaster", false)).toBe(true);
  });

  it("answers a server client's evaluation, from the recipe it is given", async () => {
    const real = new ServerMemoryProvider(configuration({ "new-roaster": false }));
    let recipe: Recipe | undefined = RECIPE;
    await ServerFeature.setProviderAndWait(withMockFlags(real, { recipe: () => recipe }));
    const client = ServerFeature.getClient();

    await expect(client.getBooleanValue("new-roaster", false)).resolves.toBe(true);
    recipe = undefined;
    await expect(client.getBooleanValue("new-roaster", true)).resolves.toBe(false);
  });
});
