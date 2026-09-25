#!/usr/bin/env node
import { run } from "./run.js";

/** Replaced with the package version at release time. */
const VERSION = "0.0.0";

const result = await run(process.argv.slice(2), { version: VERSION });
const stream = result.exitCode === 0 ? process.stdout : process.stderr;

stream.write(`${result.output}\n`);
process.exitCode = result.exitCode;
