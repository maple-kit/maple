/**
 * Which page a draft was written on. The host is ignored, because a preview
 * host is per branch and differs between local and deployed; the query string
 * is ignored too, because it often picks a tab rather than a page.
 */

import { useSyncExternalStore } from "react";

import type { Draft } from "@maple-kit/core/overlay";

/** How often a single-page app's route is read, since it emits no event. */
const ROUTE_POLL_MS = 400;

/** The path of a URL without its trailing slash, or undefined when it is not one. */
export function pathOf(url: string | undefined): string | undefined {
  if (url === undefined || url === "") return undefined;
  try {
    const { pathname } = new URL(url, "https://route.invalid");
    return trimmed(pathname);
  } catch {
    return undefined;
  }
}

function trimmed(pathname: string): string {
  let end = pathname.length;
  while (end > 1 && pathname[end - 1] === "/") end -= 1;
  return pathname.slice(0, end);
}

/** Where a draft was written, path and query, or undefined for one that never said. */
export function draftRoute(draft: Draft): string | undefined {
  const url = draft.context?.url;
  return pathOf(url) === undefined ? undefined : url?.replace(/^\w+:\/\/[^/]*/, "");
}

/** A draft that never recorded a page is treated as written here. */
export function isOnPage(draft: Draft, pathname: string): boolean {
  const path = pathOf(draft.context?.url);
  return path === undefined || path === pathOf(pathname);
}

/** The current pathname, re-read on history events and on a slow tick. */
export function usePathname(view: Window | null | undefined): string {
  return useSyncExternalStore(
    (notify) => {
      view?.addEventListener("popstate", notify);
      const timer = setInterval(notify, ROUTE_POLL_MS);
      return () => {
        view?.removeEventListener("popstate", notify);
        clearInterval(timer);
      };
    },
    () => view?.location.pathname ?? "/",
    () => "/",
  );
}
