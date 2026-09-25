/**
 * Deciding what one intercepted request answers, under a recipe.
 *
 * A call the recipe does not name keeps the server's answer. A body state
 * reshapes the server's own answer, so it is as fresh as the page; a failure
 * or a hold needs nothing from the server, and nothing is sent for it.
 */

import { isData } from "./codec.js";
import { reshape, reshapeTyped } from "./transform.js";

import type { Answer, Call, Codec } from "./codec.js";
import type { Inventory, Sample } from "./inventory.js";
import type { BodyState } from "./transform.js";
import type { MockState, Recipe } from "@maple-kit/core/mock";

/** What {@link resolve} needs besides the request. */
export interface ResolveOptions {
  /** Tried in order; the first to claim a request owns it. */
  readonly codecs: readonly Codec[];
  /** Sends a request to the real server, past the interceptor. */
  readonly forward: (request: Request) => Promise<Response>;
  /** The page's route pattern, which the inventory is scoped to. */
  readonly route: string;
  /** Milliseconds since the epoch, for a recorded sample. */
  readonly now?: () => number;
}

/** A request taken apart: its codec, its calls, and each call's state. */
export interface Split {
  readonly codec: Codec;
  readonly calls: readonly Call[];
  readonly states: readonly (MockState | undefined)[];
}

const BODY_STATES: ReadonlySet<MockState> = new Set<MockState>(["empty", "many", "one"]);

/** The request's calls and the state the recipe gives each, or undefined when no codec owns it. */
export async function splitRequest(
  request: Request,
  recipe: Recipe | undefined,
  codecs: readonly Codec[],
): Promise<Split | undefined> {
  for (const codec of codecs) {
    const calls = await codec.split(request.clone());
    if (calls === undefined) continue;
    const states = calls.map(
      (call) => recipe?.calls.find((named) => named.key === call.key)?.state,
    );
    return { codec, calls, states };
  }
  return undefined;
}

/**
 * The response `request` gets under `recipe`, or undefined to let it through
 * untouched. A `loading` call holds the whole response until the request is
 * abandoned, since one HTTP response cannot arrive in part.
 */
export async function resolve(
  request: Request,
  recipe: Recipe | undefined,
  inventory: Inventory,
  options: ResolveOptions,
): Promise<Response | undefined> {
  const applies = recipe?.route === undefined || recipe.route === options.route;
  const split = await splitRequest(request, applies ? recipe : undefined, options.codecs);
  if (split === undefined || split.states.every((state) => state === undefined)) return undefined;
  if (split.states.includes("loading")) return hold(request.signal);

  const needsServer = split.states.some((state) => state === undefined || BODY_STATES.has(state));
  const sent = split.codec.prepare?.(request) ?? request;
  const real = needsServer ? await options.forward(sent) : undefined;
  const live = real === undefined ? undefined : await split.codec.read(real.clone(), split.calls);
  if (real !== undefined && live === undefined) return real;

  record(inventory, split.calls, live, options);
  const answers = split.calls.map((call, index) =>
    answer(split.states[index], live?.[index], inventory.sample(call.key, options.route)),
  );
  return split.codec.join(split.calls, answers, real);
}

/** Records every real 2xx answer. A mocked one is never recorded. */
export function record(
  inventory: Inventory,
  calls: readonly Call[],
  answers: readonly Answer[] | undefined,
  options: Pick<ResolveOptions, "now" | "route">,
): void {
  const at = (options.now ?? Date.now)();
  calls.forEach((call, index) => {
    const answer = answers?.[index];
    if (!isData(answer)) return;
    const { body, meta, status } = answer;
    inventory.record(options.route, { key: call.key, status, body, at, ...(meta ? { meta } : {}) });
  });
}

/**
 * One call's answer. A failure borrows the envelope the call was last seen in,
 * so a superjson client can read a failure nothing was fetched for.
 */
function answer(state: MockState | undefined, live: Answer | undefined, sample?: Sample): Answer {
  if (state === "error" || state === "forbidden") {
    const meta = live?.meta ?? sample?.meta;
    return { kind: "failure", state, ...(meta === undefined ? {} : { meta: {} }) };
  }
  if (state === undefined || !BODY_STATES.has(state)) return live ?? failure();
  const source = isData(live) ? live : sample;
  if (source === undefined) return live ?? failure();
  if (source.meta === undefined) {
    return { kind: "data", status: 200, body: reshape(state as BodyState, source.body) };
  }
  return {
    kind: "data",
    status: 200,
    ...reshapeTyped(state as BodyState, source.body, source.meta),
  };
}

function failure(): Answer {
  return { kind: "failure", state: "error" };
}

/**
 * Settles only when the request is abandoned. The signal may already have
 * aborted while the request was being taken apart, and fires no event then.
 */
function hold(signal: AbortSignal): Promise<never> {
  if (signal.aborted) return Promise.reject(signal.reason as Error);
  return new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason as Error), { once: true });
  });
}
