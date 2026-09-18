import { describe, expect, it } from "vitest";

import {
  clampWaitMs,
  DEFAULT_WAIT_MS,
  MAX_WAIT_MS,
  MIN_WAIT_MS,
  PROGRESS_INTERVAL_MS,
} from "../src/timeout.js";

describe("clampWaitMs", () => {
  it("uses the default when no wait is requested", () => {
    expect(clampWaitMs(undefined)).toBe(DEFAULT_WAIT_MS);
  });

  it("keeps a wait that is already inside the budget", () => {
    expect(clampWaitMs(20_000)).toBe(20_000);
  });

  it("clamps down to the ceiling every client tolerates", () => {
    expect(clampWaitMs(120_000)).toBe(MAX_WAIT_MS);
  });

  it("clamps up to the floor", () => {
    expect(clampWaitMs(5)).toBe(MIN_WAIT_MS);
  });

  it("rejects a negative wait by clamping to the floor", () => {
    expect(clampWaitMs(-1)).toBe(MIN_WAIT_MS);
  });

  it("falls back to the default for NaN and Infinity", () => {
    expect(clampWaitMs(Number.NaN)).toBe(DEFAULT_WAIT_MS);
    expect(clampWaitMs(Number.POSITIVE_INFINITY)).toBe(DEFAULT_WAIT_MS);
  });

  it("truncates a fractional wait", () => {
    expect(clampWaitMs(20_000.9)).toBe(20_000);
  });
});

describe("the timeout budget", () => {
  it("stays under the 60s ceiling clients enforce", () => {
    expect(MAX_WAIT_MS).toBeLessThan(60_000);
  });

  it("reports progress often enough to be seen before the ceiling", () => {
    expect(PROGRESS_INTERVAL_MS * 2).toBeLessThan(MAX_WAIT_MS);
  });
});
