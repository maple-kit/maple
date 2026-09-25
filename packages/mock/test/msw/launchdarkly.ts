/**
 * LaunchDarkly's flag poll, answered as its FDv1 endpoint does, at a fake
 * `baseUri`. `fail()` makes it answer 500, so the error path is exercised.
 */

import { http, HttpResponse } from "msw";

import type { RequestHandler } from "msw";

export const LD_BASE = "https://flags.preview.example/ld";
export const LD_ENV = "env-roastery";

/** One flag entry, as the poll answers it. */
export const LD_FLAGS = {
  "new-roaster": { value: false, variation: 1, version: 7, flagVersion: 3, trackEvents: false },
  "roast-limit": { value: 3, variation: 0, version: 4, flagVersion: 2, trackEvents: false },
};

export function createLaunchDarklyFake() {
  let failing = false;
  const handlers: RequestHandler[] = [
    http.get(`${LD_BASE}/sdk/evalx/${LD_ENV}/contexts/:context`, () =>
      failing
        ? HttpResponse.json({ message: "upstream" }, { status: 500 })
        : HttpResponse.json(LD_FLAGS),
    ),
    http.post(`${LD_BASE}/events/:kind/${LD_ENV}`, () => new HttpResponse(null, { status: 202 })),
  ];
  return {
    handlers,
    fail() {
      failing = true;
    },
    reset() {
      failing = false;
    },
  };
}
