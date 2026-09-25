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
  refuseNext(status: number): void;
  reset(): void;
}

export function createPlanFake(): PlanFake {
  const asked: MockPlanRequest[] = [];
  let refusal: number | undefined;

  const handlers = [
    http.post(PLAN_URL, async ({ request }) => {
      if (refusal !== undefined) {
        const status = refusal;
        refusal = undefined;
        return HttpResponse.json({ error: "refused" }, { status });
      }
      const body = (await request.json()) as MockPlanRequest;
      asked.push(body);
      if (body.request.trim() === "") return HttpResponse.json({ plan: null });
      const calls = body.calls.map(({ key }) => ({ key, concerned: true, p: 0.9 }));
      return HttpResponse.json({ plan: { ...SURE, calls } });
    }),
  ];

  return {
    handlers,
    asked,
    refuseNext(status) {
      refusal = status;
    },
    reset() {
      asked.length = 0;
      refusal = undefined;
    },
  };
}
