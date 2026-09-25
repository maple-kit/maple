/**
 * The page's feature flags, from LaunchDarkly's own browser SDK. The dev and
 * preview servers answer its poll at `/ld` (see `vite.config.ts`), so the
 * example needs no account; a real app points it at LaunchDarkly.
 */

import { createClient } from "@launchdarkly/js-client-sdk";
import { useEffect, useState } from "react";

import { LD_BASE } from "./ld.js";

const client = createClient(
  "example-env",
  { kind: "user", key: "ada" },
  {
    baseUri: LD_BASE,
    streamUri: LD_BASE,
    eventsUri: LD_BASE,
    fetchGoals: false,
    sendEvents: false,
    streaming: false,
    // A preview reloads into each mock; a cached answer would outlive Turn off.
    disableCache: true,
  },
);
const started = client.start();

/** A boolean flag's value, `fallback` until the SDK has answered. */
export function useFlag(key: string, fallback: boolean): boolean {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    let live = true;
    void started.then(() => live && setValue(client.boolVariation(key, fallback)));
    return () => {
      live = false;
    };
  }, [key, fallback]);
  return value;
}
