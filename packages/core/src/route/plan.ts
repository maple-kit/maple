/**
 * `POST {base}/mock/plan`: a reviewer's sentence, read as a mock.
 *
 * The page sends the sentence and the calls it has recorded; the route adds
 * what the shapes say each call returns, asks the classifier, and answers the
 * plan. The provider is reached from here and never from the browser.
 */

import { stableStringify } from "../lib/stable-stringify.js";
import { createCache, createLimiter, json } from "./budget.js";
import { MOCK_SCHEMA_KEYS } from "./mock.js";
import { confined, planRoles, readPlanFlags } from "./plan-layers.js";
import { summarise } from "./summary.js";

import type {
  ClassifierConnector,
  MockPlan,
  MockPlanCall,
  MockPlanFlag,
} from "../connectors/types.js";
import type { Logger } from "../logger/types.js";
import type { ShapeIndex } from "../mock/shape.js";
import type { RateLimit } from "./budget.js";
import type { MockSchemas } from "./mock.js";

/** How a deployment switches planning on. */
export interface MockPlanOptions {
  /** A classifier that defines `plan`. One that does not leaves the endpoint at 404. */
  readonly classifier: ClassifierConnector;
  /** Plans kept, keyed by what was planned. Defaults to 200. */
  readonly cacheSize?: number;
  /** Per session, per window. Defaults to 40 calls a minute. */
  readonly rate?: RateLimit;
}

/** What the endpoint answers with: null for a sentence with nothing in it yet. */
export interface MockPlanAnswer {
  readonly plan: MockPlan | null;
}

/** The endpoint, built once so its cache and its limiter outlive a request. */
export interface MockPlanner {
  respond(request: Request, session: string, logger?: Logger): Promise<Response>;
}

/** A sentence, not a paragraph; a key or a summary, not a document. */
const MAX_REQUEST = 500;
const MAX_KEY = 300;
const MAX_SUMMARY = 500;
const KEY = /^[a-z]+:\S/;

const DEFAULT_CACHE = 200;
const DEFAULT_RATE: RateLimit = { limit: 40, windowMs: 60_000 };

/** A request the endpoint has read, before the shapes add to it. */
interface Asked {
  readonly request: string;
  readonly route: string;
  readonly calls: readonly MockPlanCall[];
  readonly flags: readonly MockPlanFlag[];
}

/**
 * Builds the endpoint, or nothing when the classifier cannot plan: presence
 * of the method is the capability, and there is no second switch.
 */
export function createMockPlanner(
  options: MockPlanOptions,
  schemas: MockSchemas,
): MockPlanner | undefined {
  const { classifier } = options;
  if (typeof classifier.plan !== "function") return undefined;
  const plan = classifier.plan.bind(classifier);
  const cache = createCache<MockPlanAnswer>(options.cacheSize ?? DEFAULT_CACHE);
  const limiter = createLimiter(options.rate ?? DEFAULT_RATE);

  return {
    async respond(request, session, logger) {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

      const { asked, error } = read(await readJson(request));
      if (asked === undefined) return json({ error }, 400);
      if (asked.request.trim() === "") return json({ plan: null } satisfies MockPlanAnswer, 200);

      const planned = await layered(asked, schemas);
      const key = stableStringify(planned);
      const hit = cache.get(key);
      if (hit) return json(hit, 200);

      if (!limiter.take(session)) return json({ error: "Too many plans" }, 429);

      try {
        const answer = {
          plan: confined(await plan({ ...planned, signal: request.signal }), planned),
        };
        cache.set(key, answer);
        return json(answer, 200);
      } catch (error) {
        logger?.warn("A mock request could not be planned.", { error: String(error) });
        return json({ error: "The request could not be planned" }, 502);
      }
    },
  };
}

/** The request, or the reason it is not one. */
function read(posted: unknown): { asked?: Asked; error?: string } {
  if (!isRecord(posted)) return { error: "A body is required" };
  const { request, route, calls } = posted;
  const flags = readPlanFlags(posted["flags"]);
  if (flags.flags === undefined) return { error: flags.error ?? "flags" };
  if (typeof request !== "string" || request.length > MAX_REQUEST) {
    return { error: `request: a string of at most ${MAX_REQUEST} characters` };
  }
  if (typeof route !== "string" || !route.startsWith("/") || route.length > MAX_KEY) {
    return { error: 'route: a path pattern starting with "/"' };
  }
  if (!Array.isArray(calls) || calls.length > MOCK_SCHEMA_KEYS) {
    return { error: `calls: a list of at most ${MOCK_SCHEMA_KEYS}` };
  }
  const read = calls.map(readCall);
  if (read.some((call) => call === undefined)) {
    return { error: "calls: each a { key, summary } with a codec-prefixed key" };
  }
  return { asked: { request, route, calls: read as MockPlanCall[], flags: flags.flags } };
}

function readCall(call: unknown): MockPlanCall | undefined {
  if (!isRecord(call)) return undefined;
  const { key, summary = "" } = call;
  if (typeof key !== "string" || key.length > MAX_KEY || !KEY.test(key)) return undefined;
  if (typeof summary !== "string" || summary.length > MAX_SUMMARY) return undefined;
  return { key, summary };
}

/**
 * The request a planner is given: summaries from the shapes, the flags only
 * when the page listed some, and the roles only when the host's rules list some.
 */
async function layered(asked: Asked, schemas: MockSchemas) {
  const { flags, ...rest } = asked;
  const roles = planRoles(await schemas.identity());
  return {
    ...rest,
    calls: await described(asked.calls, () => schemas.index()),
    ...(flags.length === 0 ? {} : { flags }),
    ...(roles.length === 0 ? {} : { roles }),
  };
}

/** Each call's summary, with what its shape says it returns beside the page's words. */
async function described(
  calls: readonly MockPlanCall[],
  shapes: () => Promise<ShapeIndex>,
): Promise<MockPlanCall[]> {
  const index = calls.length === 0 ? undefined : await shapes();
  return calls.map((call) => {
    return { key: call.key, summary: summarise(call.summary, index?.find(call.key)?.schema) };
  });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
