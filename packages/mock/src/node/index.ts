/**
 * The same handlers as `@maple-kit/mock/msw`, for `setupServer` in Vitest,
 * Playwright or a server render.
 *
 * MSW's handlers are one type for the worker and the server, so this is the
 * same export under the name a Node caller looks for.
 */

export { mockHandlers } from "../msw/handlers.js";

export type { MockHandlerOptions } from "../msw/handlers.js";
