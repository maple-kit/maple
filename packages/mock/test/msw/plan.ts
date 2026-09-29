/**
 * A fake of Maple's `POST {base}/mock/plan`, recording what the page sent. It
 * answers a plan by default, and `refuseNext` answers the next with a status.
 */

import { http, HttpResponse } from "msw";

import type { MockPlan, MockPlanRequest } from "@maple-kit/core/connectors";
import type { RequestHandler } from "msw";

export const PLAN_URL = "https://preview.example.com/api/maple/mock/plan";

/** An empty state for every call, sure of itself. */
export const SURE: MockPlan = {
  state: "empty",
  distribution: {
    empty: 0.8,
    error: 0.05,
    forbidden: 0.03,
    loading: 0.03,
    one: 0.03,
    many: 0.03,
    long: 0,
    sparse: 0,
    mixed: 0,
    none: 0.03,
  },
  confidence: 0.8,
  calls: [],
};

export interface PlanFake {
  readonly handlers: RequestHandler[];
  readonly asked: MockPlanRequest[];
  /** What each request's body weighed on the wire, and how it was encoded. */
  readonly sent: { readonly bytes: number; readonly encoding: string | null }[];
  refuseNext(status: number): void;
  /** The next request answers as a load balancer would: an HTML body, not JSON. */
  blockNext(status: number): void;
  /** The next request never gets an answer. */
  dropNext(): void;
  reset(): void;
}

export function createPlanFake(): PlanFake {
  const asked: MockPlanRequest[] = [];
  const sent: PlanFake["sent"][number][] = [];
  let refusal: number | undefined;
  let block: number | undefined;
  let drop = false;

  const handlers = [
    http.post(PLAN_URL, async ({ request }) => {
      if (drop) {
        drop = false;
        return HttpResponse.error();
      }
      if (block !== undefined) {
        const status = block;
        block = undefined;
        return new HttpResponse("<html><body>Forbidden</body></html>", {
          status,
          headers: { "content-type": "text/html" },
        });
      }
      if (refusal !== undefined) {
        const status = refusal;
        refusal = undefined;
        return HttpResponse.json({ error: "refused" }, { status });
      }
      const encoding = request.headers.get("content-encoding");
      const wire = new Uint8Array(await request.arrayBuffer());
      sent.push({ bytes: wire.byteLength, encoding });
      const body = (await inflate(wire, encoding)) as MockPlanRequest;
      asked.push(body);
      if (body.request.trim() === "") return HttpResponse.json({ plan: null });
      const calls = body.calls.map(({ key }) => ({ key, concerned: true, p: 0.9 }));
      return HttpResponse.json({ plan: { ...SURE, calls } });
    }),
  ];

  return {
    handlers,
    asked,
    sent,
    refuseNext(status) {
      refusal = status;
    },
    blockNext(status) {
      block = status;
    },
    dropNext() {
      drop = true;
    },
    reset() {
      asked.length = 0;
      sent.length = 0;
      refusal = undefined;
      block = undefined;
      drop = false;
    },
  };
}

async function inflate(wire: Uint8Array<ArrayBuffer>, encoding: string | null): Promise<unknown> {
  if (encoding !== "gzip") return JSON.parse(new TextDecoder().decode(wire));
  const stream = new Blob([wire]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).json();
}
