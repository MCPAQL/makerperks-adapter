// Builds an MCP server exposing the MakerPerks core as MCP-AQL semantic tools backed by the
// transport-agnostic Router. `mcp_aql_read` is always present (READ ops + introspection —
// the token win). `mcp_aql_execute` is added ONLY when the router has EXECUTE ops (i.e. a
// SessionStore was wired), so the live READ-only deployment exposes just the read tool.
// See docs/ARCHITECTURE.md §2.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Router } from "./core/router.js";

const READ_TOOL = "mcp_aql_read";
const EXECUTE_TOOL = "mcp_aql_execute";

const INPUT_SCHEMA = {
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
} as const;

export function createMcpServer(router: Router): Server {
  const server = new Server(
    { name: "makerperks-adapter", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );

  const hasExecute = router.list().some((op) => op.semanticCategory === "EXECUTE");

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [
      {
        name: READ_TOOL,
        description:
          "Semantic READ endpoint for the MakerPerks builder-perks directory. " +
          'Call with { operation: "introspect" } to discover the available operations ' +
          "(list_programs, get_program, search_programs, get_application_flow, " +
          "list_application_flows) and their parameters, then call those.",
        inputSchema: INPUT_SCHEMA,
      },
    ];
    if (hasExecute) {
      tools.push({
        name: EXECUTE_TOOL,
        description:
          "Semantic EXECUTE endpoint that drives (simulated) perk applications. " +
          "Discover the EXECUTE operations via introspect (start_application, submit_step, " +
          "get_status, record_execution_step), then call them here. Steps may halt with " +
          "CONFIRMATION_REQUIRED and a token to replay.",
        inputSchema: INPUT_SCHEMA,
      });
    }
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== READ_TOOL && request.params.name !== EXECUTE_TOOL) {
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
