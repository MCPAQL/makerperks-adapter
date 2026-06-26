// Builds an MCP server exposing the MakerPerks directory as a single semantic READ
// tool (`mcp_aql_read`) backed by the transport-agnostic Router. Shared by both
// transports — this is the MCP-AQL token win (one tool, runtime introspection).
// See docs/ARCHITECTURE.md §2.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Router } from "./core/router.js";

const TOOL_NAME = "mcp_aql_read";

export function createMcpServer(router: Router): Server {
  const server = new Server(
    { name: "makerperks-adapter", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: TOOL_NAME,
        description:
          "Semantic READ endpoint for the MakerPerks builder-perks directory. " +
          'Call with { operation: "introspect" } to discover the available operations ' +
          "(list_programs, get_program, search_programs) and their parameters, then call those.",
        inputSchema: {
          type: "object",
          properties: {
            operation: {
              type: "string",
              description: "The MCP-AQL operation to run (start with introspect).",
            },
            params: {
              type: "object",
              description: "Operation parameters.",
              additionalProperties: true,
            },
          },
          required: ["operation"],
          additionalProperties: false,
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== TOOL_NAME) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              success: false,
              error: {
                code: "NOT_FOUND_OPERATION",
                message: `unknown tool: ${request.params.name}`,
              },
            }),
          },
        ],
        isError: true,
      };
    }
    const args = (request.params.arguments ?? {}) as {
      operation?: unknown;
      params?: unknown;
    };
    const operation = typeof args.operation === "string" ? args.operation : "";
    const params = (args.params ?? {}) as Record<string, unknown>;
    const result = await router.dispatch({ operation, params });
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      isError: !result.success,
    };
  });

  return server;
}
