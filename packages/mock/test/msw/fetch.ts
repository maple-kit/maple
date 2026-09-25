/**
 * A `fetch` answered by msw handlers, for a browser test.
 *
 * MSW's browser mode needs a service worker served from the page's origin,
 * which is exactly what Maple's own path refuses to need. `getResponse` runs
 * the same handlers with no worker, and a request nobody mocked fails.
 */

import { getResponse } from "msw";

import type { RequestHandler } from "msw";

export function handlerFetch(handlers: readonly RequestHandler[]): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const response = await getResponse([...handlers], request);
    if (response === undefined)
      throw new TypeError(`Nobody mocked ${request.method} ${request.url}`);
    return response;
  };
}
