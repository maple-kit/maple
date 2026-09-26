import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POLL_MS, startPolling } from "../src/client/poll.js";

/** A document-shaped stub: a visibility the test sets, and its one event. */
function page(visibility: DocumentVisibilityState = "visible") {
  const listeners = new Set<() => void>();
  const document = {
    visibilityState: visibility,
    addEventListener: (_type: string, fn: () => void, options?: AddEventListenerOptions) => {
      listeners.add(fn);
      options?.signal?.addEventListener("abort", () => listeners.delete(fn));
    },
  };
  return {
    document: document as unknown as Pick<Document, "addEventListener" | "visibilityState">,
    show: (state: DocumentVisibilityState) => {
      document.visibilityState = state;
      for (const fn of listeners) fn();
    },
    listening: () => listeners.size,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("polling the comments", () => {
  it("asks every fifteen seconds by default", () => {
    expect(POLL_MS).toBe(15_000);
  });

  it("asks once per interval while the tab is visible", () => {
    const onTick = vi.fn();
    const stop = new AbortController();
    startPolling({ intervalMs: 1000, document: page().document, onTick, signal: stop.signal });

    vi.advanceTimersByTime(3000);
    expect(onTick).toHaveBeenCalledTimes(3);
    stop.abort();
  });

  it("asks nothing from a hidden tab, and asks at once when it comes back", () => {
    const onTick = vi.fn();
    const stop = new AbortController();
    const tab = page("hidden");
    startPolling({ intervalMs: 1000, document: tab.document, onTick, signal: stop.signal });

    vi.advanceTimersByTime(5000);
    expect(onTick).not.toHaveBeenCalled();

    tab.show("visible");
    expect(onTick).toHaveBeenCalledTimes(1);
    stop.abort();
  });

  it("stops the timer and the listener with the signal", () => {
    const onTick = vi.fn();
    const stop = new AbortController();
    const tab = page();
    startPolling({ intervalMs: 1000, document: tab.document, onTick, signal: stop.signal });

    stop.abort();
    vi.advanceTimersByTime(5000);
    expect(onTick).not.toHaveBeenCalled();
    expect(tab.listening()).toBe(0);
  });

  it.each([0, -1])("is off for an interval of %i", (intervalMs) => {
    const onTick = vi.fn();
    const tab = page();
    startPolling({
      intervalMs,
      document: tab.document,
      onTick,
      signal: new AbortController().signal,
    });

    vi.advanceTimersByTime(60_000);
    expect(onTick).not.toHaveBeenCalled();
    expect(tab.listening()).toBe(0);
  });
});
