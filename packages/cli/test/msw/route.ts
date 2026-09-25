/**
 * A fake of a preview's `POST {base}/mock/plan`, recording what it was asked.
 * `answerNext` sets the next plan; `refuseNext` answers the next with a status.
 */

import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import type { MockPlan, MockPlanRequest } from "@maple-kit/core/connectors";

export const ROUTE_URL = "https://preview.example.com/api/maple";

const FLAT = {
  empty: 0.03,
  error: 0.03,
  forbidden: 0.03,
  loading: 0.03,
  one: 0.03,
  many: 0.03,
  long: 0.03,
  sparse: 0.03,
  mixed: 0.03,
  none: 0.03,
};

/** A plan with these shares, concerning the keys named. */
export function planOf(
  shares: Partial<MockPlan["distribution"]>,
  concerned: readonly string[],
): MockPlan {
  const distribution = { ...FLAT, ...shares };
  const state = (Object.keys(shares)[0] ?? "none") as MockPlan["state"];
  return {
    state,
    distribution,
    confidence: distribution[state],
    calls: concerned.map((key) => ({ key, concerned: true, p: 0.9 })),
  };
}

export function createRouteFake() {
  const asked: MockPlanRequest[] = [];
  let next: { status: number; plan?: MockPlan | null } = { status: 200, plan: null };

  const server = setupServer(
    http.post(`${ROUTE_URL}/mock/plan`, async ({ request }) => {
      asked.push((await request.json()) as MockPlanRequest);
      const { status, plan } = next;
      if (status !== 200) return HttpResponse.json({ error: "refused" }, { status });
      return HttpResponse.json({ plan: plan ?? null });
    }),
  );

  return {
    server,
    asked,
    answerNext(plan: MockPlan | null) {
      next = { status: 200, plan };
    },
    refuseNext(status: number) {
      next = { status };
    },
    reset() {
      asked.length = 0;
      next = { status: 200, plan: null };
    },
  };
}
