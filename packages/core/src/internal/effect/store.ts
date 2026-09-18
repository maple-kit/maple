/**
 * The Effect layer around a store connector.
 *
 * Contributors write plain Promise methods. Everything that makes those methods
 * survive a flaky network — typed errors, a retry schedule, a timeout — lives
 * here, once, instead of in every connector.
 *
 * Every export returns a Promise, so no caller of this module imports Effect.
 */

import { Cause, Effect, Exit, Option, Schedule } from "effect";

import { MapleStoreError } from "../../errors.js";
import { StoreRejected, StoreUnavailable } from "./errors.js";

import type { CommentPage, ListQuery, StoreConnector } from "../../connectors/types.js";
import type { Comment, CommentStatus, NewComment } from "../../types.js";

/** Three tries, 100ms apart, doubling, with jitter so retries do not synchronise. */
const RETRY_POLICY = Schedule.jittered(
  Schedule.intersect(Schedule.exponential("100 millis", 2), Schedule.recurs(2)),
);

/** How long any single connector call may take before it is abandoned. */
const CALL_TIMEOUT = "10 seconds";

/** True for errors that another attempt might get past. */
function isRetryable(cause: unknown): boolean {
  if (!(cause instanceof Error)) return true;
  return !/\b(4\d\d|invalid|unauthori[sz]ed|forbidden|not found)\b/i.test(cause.message);
}

/** Wraps one connector call with typed failure, a timeout and the retry policy. */
function call<A>(
  connector: StoreConnector,
  operation: string,
  run: () => Promise<A>,
): Effect.Effect<A, StoreRejected | StoreUnavailable> {
  return Effect.tryPromise({
    try: run,
    catch: (cause) =>
      isRetryable(cause)
        ? new StoreUnavailable({ connector: connector.name, operation, cause })
        : new StoreRejected({ connector: connector.name, operation, cause }),
  }).pipe(
    Effect.timeoutFail({
      duration: CALL_TIMEOUT,
      onTimeout: () =>
        new StoreUnavailable({
          connector: connector.name,
          operation,
          cause: new Error(`Timed out after ${CALL_TIMEOUT}.`),
        }),
    }),
    Effect.retry({ schedule: RETRY_POLICY, while: (error) => error._tag === "StoreUnavailable" }),
  );
}

/** Restates a tagged failure as the public error type. */
function toPublicError(error: StoreRejected | StoreUnavailable): MapleStoreError {
  const reason = error._tag === "StoreUnavailable" ? "unavailable" : "rejected";
  return new MapleStoreError(reason, error.connector, error.operation, error.cause);
}

/**
 * Runs the program, rejecting with a plain MapleStoreError: Effect.runPromise
 * would reject with a FiberFailure and put Effect in front of every caller.
 */
async function run<A>(program: Effect.Effect<A, StoreRejected | StoreUnavailable>): Promise<A> {
  const exit = await Effect.runPromiseExit(program.pipe(Effect.mapError(toPublicError)));
  if (Exit.isSuccess(exit)) return exit.value;

  const failure = Cause.failureOption(exit.cause);
  throw Option.getOrElse(failure, () => new Error(Cause.pretty(exit.cause)));
}

/** Lists comments, retrying transient failures. */
export function listComments(connector: StoreConnector, query: ListQuery): Promise<CommentPage> {
  return run(call(connector, "list", () => connector.list(query)));
}

/** Appends a comment, retrying transient failures. */
export function appendComment(connector: StoreConnector, comment: NewComment): Promise<Comment> {
  return run(call(connector, "append", () => connector.append(comment)));
}

/** Sets a comment's status. Resolves to null when the connector cannot do it. */
export function setCommentStatus(
  connector: StoreConnector,
  id: string,
  status: CommentStatus,
): Promise<Comment | null> {
  const setStatus = connector.setStatus?.bind(connector);
  if (!setStatus) return Promise.resolve(null);
  return run(call(connector, "setStatus", () => setStatus(id, status)));
}
