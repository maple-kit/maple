import { isSet, parseArgs } from "./args.js";
import { connectorKindRows, renderConnectorKinds } from "./commands/connectors.js";
import { mockSchema } from "./commands/mock-schema.js";
import { HELP } from "./help.js";

import type { Generate } from "./commands/mock-schema.js";

/** What the CLI needs from its environment, so tests can supply their own. */
export interface RunOptions {
  /** Reported by `--version`. */
  readonly version: string;
  /** `maple mock schema`'s generator, in place of the optional peer. */
  readonly generate?: Generate;
}

/** What a command produced: text to print and the exit code to use. */
export interface RunResult {
  readonly output: string;
  readonly exitCode: number;
}

/** Serialises `value` for `--json`, or renders it for a terminal. */
function present(json: boolean, value: unknown, text: string): RunResult {
  return { output: json ? JSON.stringify(value, null, 2) : text, exitCode: 0 };
}

/**
 * Runs one command and returns what to print.
 *
 * Nothing here writes to stdout or exits the process; that is the binary's job,
 * which is what makes every command testable as a plain function.
 */
export async function run(argv: readonly string[], options: RunOptions): Promise<RunResult> {
  const { command, flags, positionals } = parseArgs(argv);
  const json = isSet(flags, "json");

  if (isSet(flags, "version")) return { output: options.version, exitCode: 0 };
  if (isSet(flags, "help") || command === undefined) return { output: HELP, exitCode: 0 };

  if (command === "mock") return mockSchema({ flags, positionals }, options.generate);

  if (command === "connectors") {
    const rows = connectorKindRows();
    return present(json, rows, renderConnectorKinds(rows));
  }

  return {
    output: `Unknown command "${command}".\n\n${HELP}`,
    exitCode: 1,
  };
}
