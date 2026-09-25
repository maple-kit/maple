/**
 * Where the installed transport is found. The interceptor puts its handle
 * here; the box reads it without importing the interceptor, so a page that
 * shows the box but never mocks carries none of `@mswjs/interceptors`.
 */

import type { MockHandle } from "./interceptor.js";

const INSTALLED = Symbol.for("@maple-kit/mock.installed");

type Installed = typeof globalThis & { [INSTALLED]?: MockHandle };

/** The handle `installMock` returned in this page, or undefined when mocking is off. */
export function installedMock(): MockHandle | undefined {
  return (globalThis as Installed)[INSTALLED];
}

/** Internal: `installMock` is the only writer. Undefined forgets it. */
export function keepInstalled(handle: MockHandle | undefined): void {
  const global = globalThis as Installed;
  if (handle === undefined) delete global[INSTALLED];
  else global[INSTALLED] = handle;
}
