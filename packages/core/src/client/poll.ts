/**
 * Asking the route again on a timer, so a comment an agent resolved shows as
 * resolved without the reviewer reloading the page to find out.
 *
 * A hidden tab asks nothing: nobody is reading it, and a preview left open in
 * a background tab all day should not cost the store a request every few
 * seconds. Coming back to the tab asks at once rather than on the next tick.
 */

/** How often the comments are asked for again, by default. */
export const POLL_MS = 15_000;

/** What a poll needs: something to call, and the document whose tab it is. */
export interface PollOptions {
  /** Milliseconds between asks. Zero or less switches polling off. */
  readonly intervalMs: number;
  readonly document: Pick<Document, "addEventListener" | "visibilityState">;
  onTick(): void;
  /** Aborting clears the timer and the visibility listener. */
  readonly signal: AbortSignal;
}

/** Starts the timer. Everything it attached comes off with the signal. */
export function startPolling(options: PollOptions): void {
  const { document, intervalMs, signal } = options;
  if (intervalMs <= 0 || signal.aborted) return;

  const tick = () => {
    if (document.visibilityState === "visible") options.onTick();
  };
  const timer = setInterval(tick, intervalMs);
  signal.addEventListener("abort", () => clearInterval(timer), { once: true });
  document.addEventListener("visibilitychange", tick, { signal });
}
