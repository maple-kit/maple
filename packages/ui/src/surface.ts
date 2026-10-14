/**
 * Which surface the overlay is pointed at, when the build did not say.
 *
 * An application that passes `branch` has answered; one that does not is asked
 * of the route once, and a 404 there means this deploy is not a preview.
 * Anything a prop does state wins over what the route says.
 */

import { MapleRequestError, readContext } from "@maple-kit/core/client";
import { useGitHubLink } from "@maple-kit/react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ContextBody, ContextReason, MapleClientOptions } from "@maple-kit/core/client";

/** Waits before each retry of a failed first read, then it stays unavailable. */
const FIRST_READ_RETRY_MS = [1000, 3000, 10_000] as const;

/** What the branch chip and the controller are built from. */
export interface Surface {
  readonly branch: string;
  readonly label?: string;
  readonly commit?: string;
  /** A web address: the route's `pullRequestUrl`, unless a prop states one. */
  readonly pullRequest?: string;
}

/** The props that name a surface, all of them optional. */
export interface SurfaceProps {
  readonly branch?: string;
  readonly label?: string;
  readonly commit?: string;
  readonly pullRequest?: string;
}

/** Where the answer is read from, and whether to read it at all. */
export interface SurfaceSource {
  readonly enabled: boolean;
  /** A caller-owned controller already knows its branch. */
  readonly owned: boolean;
  readonly options?: Pick<MapleClientOptions, "basePath" | "fetch" | "logger"> | undefined;
}

/**
 * `loading` mounts nothing yet; `none` is the route's 404 (not a preview) and
 * mounts nothing at all; `unavailable` is a failed first read, which mounts
 * nothing either: the key only ever comes from this answer, so there is no
 * surface a key-less overlay could read or write.
 */
export type SurfaceState =
  | { readonly status: "loading" }
  | { readonly status: "none" }
  | { readonly status: "unavailable"; readonly reason: ContextReason | null }
  | {
      readonly status: "ready";
      readonly surface: Surface;
      readonly resolved: boolean;
      readonly reason: ContextReason | null;
    };

type Fetched =
  | { readonly status: "loading" }
  | { readonly status: "none" }
  | { readonly status: "unavailable"; readonly reason: ContextReason | null }
  | { readonly status: "ready"; readonly context: ContextBody };

/** A 409 is the route saying several pull requests match; any other failure is an outage. */
function ambiguous(error: unknown): boolean {
  return error instanceof MapleRequestError && error.status === 409;
}

/** A network error or a 5xx may pass; a 404 is an answer and any other 4xx will not change. */
function transient(error: unknown): boolean {
  return !(error instanceof MapleRequestError) || error.status >= 500;
}

/** An error keeps what the reviewer already sees: it only ever replaces a first load. */
function afterFailure(before: Fetched, error: unknown): Fetched {
  const reason = ambiguous(error) ? "ambiguous" : null;
  if (before.status !== "ready") return { status: "unavailable", reason };
  if (reason === null) return before;
  return { status: "ready", context: { ...before.context, resolved: false, reason } };
}

/** Props over the response, field by field. */
function merged(props: SurfaceProps, context: ContextBody | undefined, branch: string) {
  const label = props.label ?? context?.label;
  const commit = props.commit ?? context?.commit ?? undefined;
  const pullRequest = props.pullRequest ?? context?.pullRequestUrl ?? undefined;
  return {
    branch,
    ...(label === undefined ? {} : { label }),
    ...(commit === undefined ? {} : { commit }),
    ...(pullRequest === undefined ? {} : { pullRequest }),
  };
}

/**
 * The surface, and a function that reads the route's answer again — which is
 * what a reviewer linking GitHub changes: the key becomes the head ref.
 */
export function useSurface(
  props: SurfaceProps,
  source: SurfaceSource,
): { readonly state: SurfaceState; readonly refresh: () => void } {
  const asks = props.branch === undefined && source.enabled && !source.owned;
  const [fetched, setFetched] = useState<Fetched>({ status: "loading" });
  const [round, setRound] = useState(0);
  const loaded = useRef(false);
  const { basePath, fetch, logger } = source.options ?? {};

  useEffect(() => {
    if (!asks) return;
    const controller = new AbortController();
    const done = (next: (before: Fetched) => Fetched) => {
      if (!controller.signal.aborted) setFetched(next);
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = (attempt: number): void => {
      readContext({
        ...(basePath === undefined ? {} : { basePath }),
        ...(fetch === undefined ? {} : { fetch }),
        signal: controller.signal,
      }).then(
        (context) => {
          loaded.current = true;
          done(() => (context === null ? { status: "none" } : { status: "ready", context }));
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          const wait = FIRST_READ_RETRY_MS[attempt];
          if (wait !== undefined && !loaded.current && transient(error)) {
            timer = setTimeout(() => read(attempt + 1), wait);
            return;
          }
          logger?.warn("Maple could not read its preview context.", { error: String(error) });
          done((before) => afterFailure(before, error));
        },
      );
    };
    read(0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [asks, basePath, fetch, logger, round]);

  const refresh = useCallback(() => setRound((count) => count + 1), []);

  if (props.branch !== undefined || source.owned) {
    return { state: ready(merged(props, undefined, props.branch ?? ""), true, null), refresh };
  }
  if (!asks) return { state: { status: "none" }, refresh };
  if (fetched.status !== "ready") return { state: fetched, refresh };

  const { context } = fetched;
  return {
    state: ready(merged(props, context, context.branch), context.resolved, context.reason),
    refresh,
  };
}

function ready(surface: Surface, resolved: boolean, reason: ContextReason | null): SurfaceState {
  return { status: "ready", surface, resolved, reason };
}

/**
 * Called below the provider while the context is unresolved: when the link
 * the reviewer started completes, the key is worth asking about again.
 */
export function RefreshOnLink(props: { readonly refresh: () => void }): null {
  const { refresh } = props;
  const link = useGitHubLink();
  const was = useRef(link.state);

  useEffect(() => {
    if (was.current === "linking" && link.state === "linked") refresh();
    was.current = link.state;
  }, [link.state, refresh]);

  return null;
}
