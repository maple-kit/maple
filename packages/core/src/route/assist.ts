/**
 * `POST /assist`: the comment being typed, judged.
 *
 * It lives here rather than in the dispatcher because it owns state a
 * dispatcher has no business holding — a cache, so a pause and a retype cost
 * one call, and a limiter, so a stuck client cannot spend a model budget.
 *
 * The provider is reached from here and never from the browser.
 */

import { selectPillars } from "../connectors/classifier.js";
import { stableStringify } from "../lib/stable-stringify.js";
import { createCache, createLimiter, json } from "./budget.js";

import type { ClassifierConnector, KindGuess, Pillar, PillarScore } from "../connectors/types.js";
import type { Logger } from "../logger/types.js";
import type { RateLimit } from "./budget.js";

/** How a deployment switches the assist tier on. */
export interface AssistOptions {
  /** The connector. Absent from `RouteOptions`, nothing is scored at all. */
  readonly classifier: ClassifierConnector;
  /** Narrows what is judged to some of the connector's pillars, by id. */
  readonly pillars?: readonly string[];
  /** Judgements kept, keyed by what was judged. Defaults to 200. */
  readonly cacheSize?: number;
  /** Per session, per window. Defaults to 40 calls a minute. */
  readonly rate?: RateLimit;
}

/** What the endpoint answers with. */
export interface AssistAnswer {
  readonly scores: readonly PillarScore[];
  /** Null when the connector does not classify, not when it was unsure. */
  readonly kind: KindGuess | null;
}

/** The endpoint, built once so its cache and its limiter outlive a request. */
export interface Assist {
  /** What a surface renders labels from. Empty when nothing is scored. */
  readonly pillars: readonly Pillar[];
  respond(request: Request, session: string, logger?: Logger): Promise<Response>;
}

/** Longer than a comment anyone reads, and short enough to stay cheap. */
const MAX_BODY = 4000;

const DEFAULT_CACHE = 200;
const DEFAULT_RATE: RateLimit = { limit: 40, windowMs: 60_000 };

/** Builds the endpoint. Nothing is requested until a comment is judged. */
export function createAssist(options: AssistOptions): Assist {
  const { classifier } = options;
  const pillars = classifier.score ? selectPillars(classifier, options.pillars) : [];
  const cache = createCache<AssistAnswer>(options.cacheSize ?? DEFAULT_CACHE);
  const limiter = createLimiter(options.rate ?? DEFAULT_RATE);

  return {
    pillars,

    async respond(request, session, logger) {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

      const body = await bodyOf(request);
      if (body === undefined) return json({ error: "A body is required" }, 400);
      if (body.length > MAX_BODY) return json({ error: "That is too long to judge" }, 413);
      if (body.trim() === "") return json({ scores: [], kind: null } satisfies AssistAnswer, 200);

      const key = stableStringify({ body, pillars: pillars.map(idOf) });
      const hit = cache.get(key);
      if (hit) return json(hit, 200);

      if (!limiter.take(session)) return json({ error: "Too many judgements" }, 429);

      try {
        const answer = await judge(classifier, body, pillars, request.signal);
        cache.set(key, answer);
        return json(answer, 200);
      } catch (error) {
        logger?.warn("A comment could not be judged.", { error: String(error) });
        return json({ error: "The comment could not be judged" }, 502);
      }
    },
  };
}

/** Both questions at once, so a connector reaching a model makes one round trip. */
async function judge(
  classifier: ClassifierConnector,
  body: string,
  pillars: readonly Pillar[],
  signal: AbortSignal,
): Promise<AssistAnswer> {
  const ask = { body, signal };
  const [scores, kind] = await Promise.all([
    classifier.score?.({ ...ask, pillars: pillars.map(idOf) }) ?? [],
    classifier.classify?.(ask) ?? null,
  ]);

  return { scores, kind };
}

/** The comment to judge, or undefined when the request did not carry one. */
async function bodyOf(request: Request): Promise<string | undefined> {
  try {
    const posted = (await request.json()) as { body?: unknown } | null;
    return typeof posted?.body === "string" ? posted.body : undefined;
  } catch {
    return undefined;
  }
}

function idOf(pillar: Pillar): string {
  return pillar.id;
}
