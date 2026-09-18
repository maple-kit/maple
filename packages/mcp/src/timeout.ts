/**
 * Timeout budget for the waiting tool.
 *
 * `wait_for_comments` is a long poll, and every coding client kills a tool call
 * that outlives its own ceiling. Cursor's ACP path hardcodes 60 seconds and
 * Codex defaults to the same, so Maple clamps below both and returns a timeout
 * result rather than letting the client tear the call down.
 */

/** Longest wait Maple will hold a poll open for. */
export const MAX_WAIT_MS = 55_000;

/** Wait used when the caller does not ask for one. */
export const DEFAULT_WAIT_MS = 30_000;

/** Shortest wait worth making a round trip for. */
export const MIN_WAIT_MS = 1_000;

/** How often progress is reported while a poll is open. */
export const PROGRESS_INTERVAL_MS = 15_000;

/** Brings any requested timeout inside the budget the clients allow. */
export function clampWaitMs(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_WAIT_MS;
  return Math.min(Math.max(Math.trunc(requested), MIN_WAIT_MS), MAX_WAIT_MS);
}
