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
    if (response.body === null) return response;
    return new Response(abortable(response.body, request.signal), response);
  };
}

/**
 * A body that errors when the request's signal aborts before it is read to
 * the end, as a real `fetch` does. tRPC's stream link aborts on its last call.
 */
function abortable(body: ReadableStream<Uint8Array>, signal: AbortSignal): ReadableStream {
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      signal.addEventListener("abort", () => {
        try {
          controller.error(signal.reason);
        } catch {
          // Already closed: an abort after the last byte changes nothing.
        }
        reader.cancel(signal.reason).catch(() => undefined);
      });
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel: (reason) => reader.cancel(reason),
  });
}
