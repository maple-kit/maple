/**
 * What a plan request weighs on the wire. A web application firewall measures
 * the bytes it sees, and a page's calls grow with the page, so the body is
 * gzipped where the browser can and the calls are sent in batches under a budget.
 */

import type { MockPlan, MockPlanRequest } from "@maple-kit/core/connectors";

/** Bytes on the wire per request, under the 8 KB a managed WAF rule allows. */
export const PLAN_BODY_BUDGET = 6 * 1024;

/** A request body, as it will be sent. */
export interface EncodedBody {
  readonly bytes: Uint8Array<ArrayBuffer>;
  /** True when `bytes` are gzipped and the request must say so. */
  readonly gzip: boolean;
}

/** Turns a request into its wire form. */
export type Encode = (request: MockPlanRequest) => Promise<EncodedBody>;

/** The request as JSON, gzipped when the browser has `CompressionStream`. */
export async function encodeBody(request: MockPlanRequest): Promise<EncodedBody> {
  const { request: sentence, route, calls, flags } = request;
  const json = JSON.stringify({ request: sentence, route, calls, ...(flags ? { flags } : {}) });
  const plain = new TextEncoder().encode(json);
  if (typeof CompressionStream === "undefined") return { bytes: plain, gzip: false };
  const stream = new Blob([plain]).stream().pipeThrough(new CompressionStream("gzip"));
  return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), gzip: true };
}

/**
 * The request split into consecutive parts whose bodies each fit `budget`.
 * A call that alone exceeds it still goes, alone: it cannot be split.
 */
export async function splitRequest(
  request: MockPlanRequest,
  encode: Encode,
  budget = PLAN_BODY_BUDGET,
): Promise<MockPlanRequest[]> {
  if ((await encode(request)).bytes.byteLength <= budget) return [request];
  const parts: MockPlanRequest[] = [];
  let taken: MockPlanRequest["calls"] = [];
  for (const call of request.calls) {
    const grown = [...taken, call];
    const fits = (await encode({ ...request, calls: grown })).bytes.byteLength <= budget;
    if (fits || taken.length === 0) {
      taken = grown;
      continue;
    }
    parts.push({ ...request, calls: taken });
    taken = [call];
  }
  if (taken.length > 0) parts.push({ ...request, calls: taken });
  return parts;
}

/**
 * One plan out of the batches'. Each batch read the same sentence over
 * different calls, so the most confident one speaks for the state, and the
 * calls are laid end to end in the order they were asked.
 */
export function mergePlans(plans: readonly MockPlan[]): MockPlan {
  const [first, ...rest] = plans;
  if (first === undefined) throw new RangeError("There is no plan to merge.");
  if (rest.length === 0) return first;
  const lead = plans.reduce((best, next) => (next.confidence > best.confidence ? next : best));
  const flags = strongest(plans);
  const role = plans
    .flatMap((plan) => (plan.role === undefined ? [] : [plan.role]))
    .sort((a, b) => b.p - a.p)[0];
  return {
    state: lead.state,
    distribution: lead.distribution,
    confidence: lead.confidence,
    calls: plans.flatMap((plan) => plan.calls),
    ...(flags.length === 0 ? {} : { flags }),
    ...(role === undefined ? {} : { role }),
  };
}

/** Each flag's most certain verdict across the batches, in the order first seen. */
function strongest(plans: readonly MockPlan[]) {
  const byKey = new Map<string, NonNullable<MockPlan["flags"]>[number]>();
  for (const flag of plans.flatMap((plan) => plan.flags ?? [])) {
    const held = byKey.get(flag.key);
    if (held === undefined || flag.p > held.p) byKey.set(flag.key, flag);
  }
  return [...byKey.values()];
}
