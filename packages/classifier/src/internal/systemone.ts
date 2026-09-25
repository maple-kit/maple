/**
 * The Effect half of the provider, and the only file in this package that
 * imports Effect.
 *
 * Everything it exports returns a Promise and rejects with a plain `Error`,
 * so no caller — and nothing on the public entrypoint — ever sees an Effect,
 * a `FiberFailure` or an `AiError`.
 */

import { TypeSafeClient } from "@effect/ai-typesafe";
import { Cause, Effect, Exit, Layer, ManagedRuntime, Redacted } from "effect";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";

import { ClassifierRequestError } from "../errors.js";

import type { Answer, Json, Question } from "../questions.js";

/** What the caller supplies once, when the connector is built. */
export interface SystemOneOptions {
  readonly apiKey: string;
  readonly baseUrl?: string | undefined;
  readonly model: string;
  /** How long one judgement may take before it is abandoned as stale. */
  readonly timeoutMs: number;
}

/** What one question map is asked about. */
export interface SystemOneCall {
  readonly connector: string;
  readonly operation: string;
  readonly questions: Readonly<Record<string, Question>>;
  readonly signal: AbortSignal | undefined;
  readonly state: { readonly [key: string]: Json };
}

/** A live connection to one System One endpoint, reused across calls. */
export interface SystemOne {
  ask(call: SystemOneCall): Promise<Readonly<Record<string, Answer>>>;
}

/**
 * Opens one.
 *
 * There are deliberately no retries. This runs on a keystroke: a retry holds
 * the request open past the moment its answer was wanted, and the next
 * keystroke is a better retry than any schedule.
 */
export function openSystemOne(options: SystemOneOptions): SystemOne {
  const runtime = ManagedRuntime.make(layerFor(options));

  return {
    async ask(call) {
      call.signal?.throwIfAborted();
      const request = { model: options.model, questions: call.questions, state: call.state };
      const program = Effect.timeout(
        Effect.flatMap(TypeSafeClient.TypeSafeClient, (client) => client.systemOne(request)),
        options.timeoutMs,
      );

      const exit = await runtime.runPromiseExit(program, { signal: call.signal });
      if (Exit.isSuccess(exit)) return exit.value.answers;

      call.signal?.throwIfAborted();
      throw new ClassifierRequestError(call.connector, call.operation, reasonFor(exit.cause));
    },
  };
}

/** The client and the transport it reaches the endpoint through. */
function layerFor(options: SystemOneOptions): Layer.Layer<TypeSafeClient.TypeSafeClient> {
  const client = TypeSafeClient.layer({
    apiKey: Redacted.make(options.apiKey),
    ...(options.baseUrl === undefined ? {} : { apiUrl: options.baseUrl }),
  });

  return Layer.provide(client, FetchHttpClient.layer);
}

/** Restates a failed exit as the plainest true thing about it. */
function reasonFor(cause: Cause.Cause<unknown>): Error {
  const squashed = Cause.squash(cause);
  return squashed instanceof Error ? squashed : new Error(Cause.pretty(cause));
}
