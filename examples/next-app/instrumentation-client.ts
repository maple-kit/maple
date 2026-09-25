/**
 * Maple Mock's interceptor, on a preview build and `next dev` only. Next runs
 * this file before hydration, so it is in place before the page's first call.
 *
 * `MAPLE_MOCK` is inlined at build time, so a production build drops the
 * import entirely; `pnpm verify` checks that it does.
 */

import { installMock } from "@maple-kit/mock";

if (process.env.MAPLE_MOCK === "1") {
  // Maple's route is never mocked, and its /mock/schema answers each call's shape.
  installMock({ route: "/api/maple" });
}
