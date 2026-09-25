/**
 * Maple Mock's interceptor, on a preview build only. Imported first from
 * `main.tsx`, so it is in place before the page's first request.
 *
 * `__MAPLE_PREVIEW__` is a build-time constant, so a production build drops
 * the import entirely; `pnpm verify` checks that it does.
 */

import { installMock } from "@maple-kit/mock";
import { launchDarklyFlags } from "@maple-kit/mock/launchdarkly";

import { LD_BASE } from "./app/ld.js";

if (__MAPLE_PREVIEW__) {
  // Maple's route is never mocked, and its /mock/schema answers each call's
  // shape. LaunchDarkly's poll is answered with the recipe's flags written in.
  const flags = launchDarklyFlags({ baseUri: LD_BASE, streamUri: LD_BASE });
  installMock({ route: "/api/maple", flags: [flags] });
}
