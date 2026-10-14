/**
 * Flags a server read, reported to the mock box in a response header. Node
 * only: it uses `AsyncLocalStorage`, so a browser entrypoint never imports it.
 */

import { FLAGS_HEADER, formatFlagsHeader } from "../mock/flags-header.js";
import { collectFlagUse, noteFlagUse } from "./collector.js";

export { FLAGS_HEADER, FLAGS_HEADER_LIMIT } from "../mock/flags-header.js";

/**
 * Notes that the request being served read the flag `key`. It does nothing
 * outside a `withFlagUse` handler, and nothing unless the Maple route was
 * created with `mock.preview` on, so a production build collects nothing.
 */
export function recordFlagUse(key: string): void {
  noteFlagUse(key);
}

/**
 * Wraps a route handler or middleware so the flags it reads, through
 * `recordFlagUse`, come back in the `x-maple-flags` response header. A flag
 * read after the handler returns, such as while a body streams, is not seen.
 */
export function withFlagUse<A extends unknown[]>(
  handler: (...args: A) => Response | Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args) => {
    const { result, keys } = collectFlagUse(() => handler(...args));
    return withHeader(await result, formatFlagsHeader(keys));
  };
}

function withHeader(response: Response, value: string): Response {
  if (value === "") return response;
  try {
    response.headers.set(FLAGS_HEADER, value);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    headers.set(FLAGS_HEADER, value);
    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
  }
}
