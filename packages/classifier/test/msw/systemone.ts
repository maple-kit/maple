/**
 * A fake of the one System One endpoint this package calls.
 *
 * A fake rather than fixed responses because the property under test is that
 * every pillar and the kind travel in *one* request: a handler returning a
 * constant cannot say how many calls were made, or what was asked in them.
 */

import { delay, http, HttpResponse } from "msw";

import type { RequestHandler } from "msw";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";

/** One request, as the fake recorded it. */
export interface Asked {
  readonly model: string;
  readonly questions: Record<string, { type: string; instructions: string; criteria: unknown }>;
  readonly state: unknown;
}

/** A fake endpoint, plus what it was asked. */
export interface SystemOneFake {
  readonly handlers: RequestHandler[];
  /** Every request, oldest first. */
  readonly asked: readonly Asked[];
  /** Answers the next request with this status and body instead. */
  failNext(status: number, body?: unknown): void;
  /** Never answers the next request, so the caller's timeout is what ends it. */
  stallNext(): void;
  /** Forgets every request, so one test cannot see another's. */
  reset(): void;
}

/** Creates the fake at `url`, answering each question with a plausible shape. */
export function createSystemOneFake(url = ENDPOINT): SystemOneFake {
  const asked: Asked[] = [];
  let failure: { status: number; body: unknown } | undefined;
  let stalling = false;

  const handlers: RequestHandler[] = [
    http.post(url, async ({ request }) => {
      if (stalling) {
        stalling = false;
        await delay("infinite");
      }
      if (failure !== undefined) {
        const { status, body } = failure;
        failure = undefined;
        return HttpResponse.json(body ?? { detail: "refused" }, { status });
      }

      const payload = (await request.json()) as Asked;
      asked.push(payload);

      return HttpResponse.json({
        model: "jev-1.13.0",
        answers: Object.fromEntries(
          Object.entries(payload.questions).map(([key, question]) => [
            key,
            answerTo(key, question),
          ]),
        ),
        usage: { input_tokens: 512, output_tokens: 64 },
      });
    }),
  ];

  return {
    asked,
    failNext(status, body) {
      failure = { status, body };
    },
    stallNext() {
      stalling = true;
    },
    handlers,
    reset() {
      asked.length = 0;
      failure = undefined;
      stalling = false;
    },
  };
}

/**
 * A lopsided but legal distribution, so a test can tell the levels apart. A
 * `noul` about an even-numbered call holds and an odd-numbered one does not.
 */
function answerTo(key: string, question: { type: string; criteria: unknown }): unknown {
  if (question.type === "noul") {
    return { type: "noul", noul: Number(key.split(":")[1] ?? 0) % 2 === 0 ? 0.8 : 0.2 };
  }
  if (question.type === "choice") {
    const options = Object.keys(question.criteria as Record<string, string>);
    return {
      type: "choice",
      choice: options[1] ?? options[0],
      confidence: 0.7,
      probabilities: spread(options, 1),
    };
  }

  const levels = (question.criteria as readonly string[]).map((_, index) => String(index));
  return { type: "score", score: 1, confidence: 0.6, legend: {}, probabilities: spread(levels, 1) };
}

/** Gives `peak` most of the probability and shares the rest out evenly. */
function spread(keys: readonly string[], peak: number): Record<string, number> {
  const rest = keys.length > 1 ? 0.3 / (keys.length - 1) : 0;
  return Object.fromEntries(keys.map((key, index) => [key, index === peak ? 0.7 : rest]));
}
