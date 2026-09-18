/**
 * Argument parsing.
 *
 * Maple's CLI surface is small and stable, so it parses its own arguments
 * rather than taking a dependency. Everything is `--flag`, `--flag=value` or a
 * positional; there are no single-letter clusters to disambiguate.
 */

/** A parsed command line. */
export interface ParsedArgs {
  /** The subcommand, or undefined when none was given. */
  readonly command?: string;
  /** Positional arguments after the subcommand. */
  readonly positionals: readonly string[];
  /** Flags, with bare flags recorded as `true`. */
  readonly flags: Readonly<Record<string, boolean | string>>;
}

/** Splits `--name=value` into its parts; value is true for a bare flag. */
function parseFlag(token: string): [string, boolean | string] {
  const body = token.slice(2);
  const equals = body.indexOf("=");
  if (equals === -1) return [body, true];
  return [body.slice(0, equals), body.slice(equals + 1)];
}

/** Parses `argv` (without the node and script entries). */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, boolean | string> = {};

  for (const token of argv) {
    if (token.startsWith("--")) {
      const [name, value] = parseFlag(token);
      flags[name] = value;
      continue;
    }
    positionals.push(token);
  }

  const [command, ...rest] = positionals;
  return { ...(command === undefined ? {} : { command }), positionals: rest, flags };
}

/** True when `flags` carries `name` set to anything other than "false". */
export function isSet(flags: ParsedArgs["flags"], name: string): boolean {
  const value = flags[name];
  return value !== undefined && value !== "false";
}
