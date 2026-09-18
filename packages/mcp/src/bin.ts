#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { storeFromEnvironment } from "./config.js";
import { createMapleServer } from "./server.js";

const server = createMapleServer({ store: storeFromEnvironment(process.env) });
await server.connect(new StdioServerTransport());
