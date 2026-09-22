#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  gateFromEnvironment,
  requireApprovalFromEnvironment,
  storeFromEnvironment,
} from "./config.js";
import { createMapleServer } from "./server.js";

const gate = gateFromEnvironment(process.env);
const server = createMapleServer({
  store: storeFromEnvironment(process.env),
  requireApproval: requireApprovalFromEnvironment(process.env),
  ...(gate === undefined ? {} : { gate }),
});

await server.connect(new StdioServerTransport());
