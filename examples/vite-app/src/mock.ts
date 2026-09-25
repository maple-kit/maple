/**
 * Maple Mock's interceptor, on a preview build only. Imported first from
 * `main.tsx`, so it is in place before the page's first request.
 *
 * `__MAPLE_PREVIEW__` is a build-time constant, so a production build drops
 * the import entirely; `pnpm verify` checks that it does.
 */

import { installMock } from "@maple-kit/mock";

if (__MAPLE_PREVIEW__) {
  // Maple's own route is not the page's data, and is never mocked.
  installMock({ ignore: (url) => url.pathname.startsWith("/api/maple") });
}
