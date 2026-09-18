import { describe, expect, it, vi } from "vitest";

import { createLogger } from "../src/logger/logger.js";
import { memorySink } from "../src/logger/sinks/memory.js";

import type { LogSink } from "../src/logger/types.js";

describe("createLogger", () => {
  it("writes info and above by default", () => {
    const sink = memorySink();
    const log = createLogger({ sinks: [sink] });

    log.debug("dropped");
    log.info("kept");
    log.warn("kept");
    log.error("kept");

    expect(sink.records.map((record) => record.level)).toEqual(["info", "warn", "error"]);
  });

  it("honours a lower threshold", () => {
    const sink = memorySink();
    createLogger({ sinks: [sink], level: "debug" }).debug("kept");

    expect(sink.records).toHaveLength(1);
  });

  it("writes nothing when given no sinks", () => {
    expect(() => createLogger({ sinks: [] }).error("nowhere to go")).not.toThrow();
  });

  it("merges bound fields under per-call fields", () => {
    const sink = memorySink();
    const log = createLogger({ sinks: [sink], fields: { service: "core", run: 1 } });

    log.info("hello", { run: 2 });

    expect(sink.records[0]?.fields).toEqual({ service: "core", run: 2 });
  });

  it("accumulates fields through child loggers", () => {
    const sink = memorySink();
    const log = createLogger({ sinks: [sink], fields: { service: "core" } });

    log.child({ branch: "main" }).child({ commentId: "c_1" }).info("nested");

    expect(sink.records[0]?.fields).toEqual({
      service: "core",
      branch: "main",
      commentId: "c_1",
    });
  });

  it("takes an Error as the second argument to error()", () => {
    const sink = memorySink();
    const boom = new Error("boom");

    createLogger({ sinks: [sink] }).error("failed", boom);

    expect(sink.records[0]?.error).toBe(boom);
    expect(sink.records[0]?.fields).toEqual({});
  });

  it("keeps going when a sink throws", () => {
    const broken: LogSink = {
      name: "broken",
      write: vi.fn(() => {
        throw new Error("sink is down");
      }),
    };
    const working = memorySink();

    expect(() => createLogger({ sinks: [broken, working] }).info("still logged")).not.toThrow();
    expect(working.records).toHaveLength(1);
  });

  it("stamps an ISO 8601 UTC timestamp", () => {
    const sink = memorySink();
    createLogger({ sinks: [sink] }).info("when");

    expect(sink.records[0]?.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
