/**
 * The route the composer talks to, faked, plus the one it needs and core has
 * not got.
 *
 * Core's fake is re-exported rather than restated: a second opinion about what
 * `/comments` returns is an opinion that drifts. Handlers are resolved through
 * a `fetch` the controller is given, because the overlay's suites run in a
 * real browser where msw would want a service worker and the CSP claim would
 * rather it did not.
 */

import { http, HttpResponse } from "msw";

import { MAPLE_BASE } from "../../../core/test/msw/maple.js";

import type { MediaRef } from "@maple-kit/core";
import type { RequestHandler } from "msw";

export {
  createMapleFake,
  MAPLE_BASE,
  MAPLE_ORIGIN,
  mapleUnavailable,
} from "../../../core/test/msw/maple.js";

/** Where an application would put a blob. Core has no such route; this stands in. */
export const UPLOAD_PATH = `${MAPLE_BASE}/uploads`;

/** What the fake upload hands back, which is what a comment keeps. */
export const UPLOADED: MediaRef = {
  connector: "test",
  key: "shot-1",
  contentType: "image/png",
};

/** Accepts one image and answers with the ref a comment would keep. */
export function uploadRoute(): RequestHandler {
  return http.post(UPLOAD_PATH, () => HttpResponse.json(UPLOADED, { status: 201 }));
}

/** The upload's own failure: the reviewer keeps the preview and is told. */
export function uploadUnavailable(): RequestHandler {
  return http.post(UPLOAD_PATH, () =>
    HttpResponse.json({ error: "Something went wrong" }, { status: 500 }),
  );
}

/** The route's own media endpoint refusing, which says nothing about why. */
export function mediaUnavailable(): RequestHandler {
  return http.post(`${MAPLE_BASE}/media`, () =>
    HttpResponse.json({ error: "Something went wrong" }, { status: 500 }),
  );
}

/**
 * A `fetch` that answers from these handlers and throws on anything else, the
 * way `onUnhandledRequest: "error"` does for the node suites.
 */
export function fetchThrough(handlers: readonly RequestHandler[]): typeof globalThis.fetch {
  let served = 0;

  return async (input, init) => {
    const request = new Request(input, init);

    for (const handler of handlers) {
      served += 1;
      const result = await handler.run({
        request: request.clone(),
        requestId: `mk-${String(served)}`,
      });
      if (result?.response) return result.response;
    }
    throw new Error(`Nothing mocked ${request.method} ${request.url}`);
  };
}
