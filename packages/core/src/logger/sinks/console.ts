/* eslint-disable no-console -- This file is the sanctioned exit to the console.
   Everything else in the repository logs through a Logger; that rule only holds
   if exactly one sink is allowed to call the console itself. */

import type { LogRecord, LogSink } from "../types.js";

/** Console method to use per level. */
const METHOD = {
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
} as const;

/** Formats a record as `HH:MM:SS.mmm level message`. */
function prefix(record: LogRecord): string {
  const time = record.at.slice(11, 23);
  return `${time} ${record.level.padEnd(5)} ${record.message}`;
}

/** Writes records to the host's console, one line each. */
export function consoleSink(): LogSink {
  return {
    name: "console",
    write(record) {
      const write = console[METHOD[record.level]].bind(console);
      const hasFields = Object.keys(record.fields).length > 0;

      if (record.error) {
        write(prefix(record), hasFields ? record.fields : "", record.error);
        return;
      }
      if (hasFields) {
        write(prefix(record), record.fields);
        return;
      }
      write(prefix(record));
    },
  };
}
