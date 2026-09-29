#!/usr/bin/env node
import { run } from "./run.js";

/** Replaced with the package version at release time. */
const VERSION = "0.0.0";

const result = await run(process.argv.slice(2), { version: VERSION });
const stream = result.exitCode === 0 ? process.stdout : process.stderr;

stream.write(`${result.output}\n`);
process.exitCode = result.exitCode;

// A command that keeps running holds the process open by itself; Ctrl-C ends it cleanly.
const running = result.running;
if (running !== undefined) {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => void running.stop().then(() => process.exit(0)));
  }
}
