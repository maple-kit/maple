/**
 * The MCP server.
 *
 * It is a thin shell: every tool is one call into `handlers.ts`, which is
 * where the behaviour lives and where it is tested. A result is returned as
 * JSON text, because every client renders that and none of them agree on
 * anything richer.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createToolHandlers } from "./handlers.js";
import { SHAPES } from "./schemas.js";
import { TOOLS } from "./tools.js";

import type { HandlerOptions } from "./handlers.js";

/** Name and version reported to a client. */
const INFO = { name: "maple", version: "0.0.0" };

/** Builds the server. Connect it to a transport to run it. */
export function createMapleServer(options: HandlerOptions): McpServer {
  const handlers = createToolHandlers(options);
  const server = new McpServer(INFO);
  const describe = (name: string) => TOOLS.find((tool) => tool.name === name)!;

  server.registerTool(
    "list_comments",
    { ...meta(describe("list_comments")), inputSchema: SHAPES.list_comments },
    async (args) => text(await handlers.listComments(defined(args))),
  );

  server.registerTool(
    "wait_for_comments",
    { ...meta(describe("wait_for_comments")), inputSchema: SHAPES.wait_for_comments },
    async (args) => text(await handlers.waitForComments(defined(args))),
  );

  server.registerTool(
    "resolve_comment",
    { ...meta(describe("resolve_comment")), inputSchema: SHAPES.resolve_comment },
    async (args) => text(await handlers.resolveComment(defined(args))),
  );

  server.registerTool(
    "get_comment_context",
    { ...meta(describe("get_comment_context")), inputSchema: SHAPES.get_comment_context },
    async (args) => text(await handlers.getCommentContext(args)),
  );

  return server;
}

function meta(tool: (typeof TOOLS)[number]) {
  return {
    title: tool.title,
    description: tool.description,
    annotations: { readOnlyHint: tool.readOnly },
  };
}

/**
 * Drops keys whose value is undefined. zod hands back every optional key,
 * which `exactOptionalPropertyTypes` treats as different from absent.
 */
function defined<T extends object>(value: T): { [K in keyof T]-?: Exclude<T[K], undefined> } {
  const entries = Object.entries(value).filter(([, one]) => one !== undefined);
  return Object.fromEntries(entries) as { [K in keyof T]-?: Exclude<T[K], undefined> };
}

function text(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}
