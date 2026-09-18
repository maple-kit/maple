import { consoleSink } from "./sinks/console.js";
import { LEVEL_RANK } from "./types.js";

import type { LogFields, Logger, LoggerOptions, LogLevel, LogRecord, LogSink } from "./types.js";

/** A sink that throws must not take the caller down with it. */
function writeSafely(sink: LogSink, record: LogRecord): void {
  try {
    sink.write(record);
  } catch {
    // A logger that can fail is worse than a logger that loses a line.
  }
}

/** Splits `error(message, fieldsOrError)` into its two possible shapes. */
function splitErrorArgument(argument: Error | LogFields | undefined): {
  fields: LogFields;
  error?: Error;
} {
  if (argument instanceof Error) return { fields: {}, error: argument };
  return { fields: argument ?? {} };
}

/**
 * Creates a logger.
 *
 * With no options it writes `info` and above to the console. Pass `sinks: []`
 * to silence it, or your own sinks to forward records somewhere else.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const sinks = options.sinks ?? [consoleSink()];
  const threshold = LEVEL_RANK[options.level ?? "info"];
  const bound = options.fields ?? {};

  function emit(level: LogLevel, message: string, fields: LogFields, error?: Error): void {
    if (LEVEL_RANK[level] < threshold) return;

    const record: LogRecord = {
      level,
      message,
      at: new Date().toISOString(),
      fields: { ...bound, ...fields },
      ...(error ? { error } : {}),
    };

    for (const sink of sinks) writeSafely(sink, record);
  }

  return {
    debug: (message, fields = {}) => emit("debug", message, fields),
    info: (message, fields = {}) => emit("info", message, fields),
    warn: (message, fields = {}) => emit("warn", message, fields),
    error: (message, argument) => {
      const { fields, error } = splitErrorArgument(argument);
      emit("error", message, fields, error);
    },
    child: (fields) =>
      createLogger({
        sinks,
        level: options.level ?? "info",
        fields: { ...bound, ...fields },
      }),
  };
}
