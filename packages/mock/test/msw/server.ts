/**
 * The msw server every suite that touches the network starts from.
 *
 * Handlers are passed in per suite rather than registered globally, so a test
 * file declares the requests it expects and nothing else satisfies it by
 * accident.
 */

import { setupServer } from "msw/node";

import type { RequestHandler } from "msw";
import type { SetupServer } from "msw/node";

/**
 * Creates a server that fails the test on any request nobody mocked.
 *
 * `onUnhandledRequest: "error"` is the point of this helper. A request that
 * slips through is a real call to a real service from a test run, and msw's
 * default of warning makes that a line in a log nobody reads.
 */
export function createTestServer(...handlers: RequestHandler[]): SetupServer {
  return setupServer(...handlers);
}

/**
 * Starts `server` for the current suite and tears it down afterwards.
 *
 * Handlers a test adds are reset between tests, so one test's override cannot
 * leak into the next. The vitest hooks are passed in to keep this file free of
 * a runner import.
 */
export function useTestServer(
  server: SetupServer,
  hooks: {
    beforeAll: (fn: () => void) => void;
    afterEach: (fn: () => void) => void;
    afterAll: (fn: () => void) => void;
  },
): void {
  hooks.beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  hooks.afterEach(() => server.resetHandlers());
  hooks.afterAll(() => server.close());
}
