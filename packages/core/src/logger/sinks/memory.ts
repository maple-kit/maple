import type { LogRecord, LogSink } from "../types.js";

/** A sink that keeps records in an array. Used by tests and by the CLI's --json. */
export interface MemorySink extends LogSink {
  readonly records: readonly LogRecord[];
  clear(): void;
}

/** Creates a sink that accumulates records in memory. */
export function memorySink(): MemorySink {
  const records: LogRecord[] = [];
  return {
    name: "memory",
    records,
    write(record) {
      records.push(record);
    },
    clear() {
      records.length = 0;
    },
  };
}
