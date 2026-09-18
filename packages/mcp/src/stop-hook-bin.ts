#!/usr/bin/env node
import { branchFromEnvironment, storeFromEnvironment } from "./config.js";
import { createToolHandlers } from "./handlers.js";
import { decideStop } from "./stop-hook.js";

import type { StopHookInput } from "./stop-hook.js";

/** Claude Code writes the hook's payload to stdin and reads the decision from stdout. */
async function readInput(): Promise<StopHookInput> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as StopHookInput;
  } catch {
    return {};
  }
}

const input = await readInput();
const handlers = createToolHandlers({ store: storeFromEnvironment(process.env) });
const open = await handlers.listComments({
  branch: branchFromEnvironment(process.env),
  statuses: ["open", "needs_reverify"],
});

process.stdout.write(JSON.stringify(decideStop(open, input)));
