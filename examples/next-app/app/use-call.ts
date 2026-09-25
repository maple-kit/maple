"use client";

import { TRPCClientError } from "@trpc/client";
import { useEffect, useState } from "react";

/** A call, as a component renders it. */
export type Loaded<T> =
  | { readonly state: "loading" }
  | { readonly state: "ready"; readonly data: T; readonly ms: number }
  | { readonly state: "failed"; readonly status: number };

/**
 * Runs `call` on mount; pass a module-level function so it runs once. Calls
 * started in the same tick go out in one streamed batch.
 */
export function useCall<T>(call: (signal: AbortSignal) => Promise<T>): Loaded<T> {
  const [loaded, setLoaded] = useState<Loaded<T>>({ state: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    const started = performance.now();
    call(controller.signal).then(
      (data) => setLoaded({ state: "ready", data, ms: performance.now() - started }),
      (error: unknown) => {
        if (!controller.signal.aborted) setLoaded({ state: "failed", status: statusOf(error) });
      },
    );
    return () => controller.abort();
  }, [call]);

  return loaded;
}

function statusOf(error: unknown): number {
  if (!(error instanceof TRPCClientError)) return 0;
  const status = (error.data as { httpStatus?: unknown } | undefined)?.httpStatus;
  return typeof status === "number" ? status : 0;
}
