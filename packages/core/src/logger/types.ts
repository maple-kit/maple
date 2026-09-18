/** Severity, ordered. Anything below a logger's threshold is dropped. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Numeric rank per level, so a threshold is a comparison. */
export const LEVEL_RANK: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/** One log line, already merged with the logger's bound fields. */
export interface LogRecord {
  readonly level: LogLevel;
  readonly message: string;
  /** ISO 8601, always UTC. */
  readonly at: string;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly error?: Error;
}

/** Somewhere a record goes. Sinks never throw; a broken sink stays silent. */
export interface LogSink {
  readonly name: string;
  write(record: LogRecord): void;
}

/** Structured data attached to a line or bound to a child logger. */
export type LogFields = Readonly<Record<string, unknown>>;

/** What core and the overlay log through. */
export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields | Error): void;
  /** A logger with `fields` merged into every record it writes. */
  child(fields: LogFields): Logger;
}

/** How to build a logger. Every field has a working default. */
export interface LoggerOptions {
  /** Defaults to a single console sink. An empty array silences the logger. */
  readonly sinks?: readonly LogSink[];
  /** Records below this level are dropped. Defaults to `"info"`. */
  readonly level?: LogLevel;
  /** Fields merged into every record. */
  readonly fields?: LogFields;
}
