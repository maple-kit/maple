/**
 * The opt-in MSW transport, for a host that already runs `setupWorker`.
 *
 * `mockHandlers(recipe)` goes first in the handler list. It needs `msw` as a
 * peer and, in a browser, `mockServiceWorker.js` on the host's origin, which
 * is the host's CSP decision and not Maple's default path.
 */

export { mockHandlers } from "./handlers.js";

export type { MockHandlerOptions } from "./handlers.js";
