#!/usr/bin/env node
import { runStopHook } from "./stop-hook-run.js";
import { fileBlockCounter, parseStopHookPayload } from "./stop-hook-session.js";

/** Claude Code writes the hook's payload to stdin and reads the decision from stdout. */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const payload = parseStopHookPayload(await readStdin());
process.stdout.write(JSON.stringify(await runStopHook(payload, process.env, fileBlockCounter())));
