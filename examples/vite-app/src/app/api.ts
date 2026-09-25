/**
 * The two calls the page makes to its own server, and a hook to make them.
 *
 * The dev and preview servers answer them from `data.ts` (see
 * `vite.config.ts`), so the page fetches what it used to import. That is what
 * gives Maple Mock something real to rewrite, and the table real states.
 */

import { useEffect, useState } from "react";

import type { AuditEvent, Row } from "./data.js";

/** `GET /api/reviews`: a page of open reviews, in the usual envelope. */
export interface Reviews {
  readonly items: readonly Row[];
  readonly total: number;
  readonly nextCursor: string | null;
}

/** `GET /api/session`: who is signed in, and what they may do. */
export interface Session {
  readonly name: string;
  readonly tint: number;
  readonly role: "owner" | "reviewer" | "guest";
  readonly permissions: readonly ("settings.write" | "reviews.export")[];
}

/** `GET /api/audit`: what changed. Owners only; anyone else is answered 403. */
export interface Audit {
  readonly items: readonly AuditEvent[];
}

/** A call, as a component renders it. */
export type Loaded<T> =
  | { readonly state: "loading" }
  | { readonly state: "ready"; readonly data: T }
  | { readonly state: "failed"; readonly status: number };

export function useApi<T>(path: string): Loaded<T> {
  const [loaded, setLoaded] = useState<Loaded<T>>({ state: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    fetch(path, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return setLoaded({ state: "failed", status: response.status });
        setLoaded({ state: "ready", data: (await response.json()) as T });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ state: "failed", status: 0 });
      });
    return () => controller.abort();
  }, [path]);

  return loaded;
}
