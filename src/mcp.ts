// Builds an MCP server exposing the MakerPerks core as MCP-AQL semantic tools backed by the
// transport-agnostic Router. `mcp_aql_read` is always present (READ ops + introspection —
// the token win). The other CRUDE tools are added ONLY when the router has an op of that
// category: `mcp_aql_create`/`mcp_aql_update`/`mcp_aql_delete` (the maker-profile surface, a
// ProfileStore was wired) and `mcp_aql_execute` (the pipeline, a SessionStore was wired). So
// the live READ-only deployment exposes just the read tool. See docs/ARCHITECTURE.md §2.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Router, SemanticCategory } from "./core/router.js";

const READ_TOOL = "mcp_aql_read";

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

// The CRUDE tools that are gated on the presence of an op in that category, in display order
// (introspect on the READ tool reveals each tool's operations). READ is always present.
const GATED_TOOLS: { name: string; category: SemanticCategory; description: string }[] =
  [
    {
      name: "mcp_aql_create",
      category: "CREATE",
      description:
        "Semantic CREATE endpoint. Discover its operations via introspect (e.g. " +
        "create_profile), then call them here.",
    },
    {
      name: "mcp_aql_update",
      category: "UPDATE",
      description:
        "Semantic UPDATE endpoint. Discover its operations via introspect (e.g. " +
        "update_profile, add_project, remove_project), then call them here.",
    },
    {
      name: "mcp_aql_delete",
      category: "DELETE",
      description:
        "Semantic DELETE endpoint. Discover its operations via introspect (e.g. " +
        "delete_profile), then call them here.",
    },
    {
      name: "mcp_aql_execute",
      category: "EXECUTE",
      description:
        "Semantic EXECUTE endpoint that drives (simulated) perk applications. " +
        "Discover the EXECUTE operations via introspect (start_application, submit_step, " +
        "get_status, record_execution_step), then call them here. Steps may halt with " +
        "CONFIRMATION_REQUIRED and a token to replay.",
    },
  ];

export function createMcpServer(router: Router): Server {
  const server = new Server(
    { name: "makerperks-adapter", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );

  const present = new Set(router.list().map((op) => op.semanticCategory));
  const enabledTools = GATED_TOOLS.filter((t) => present.has(t.category));
  const toolNames = new Set<string>([READ_TOOL, ...enabledTools.map((t) => t.name)]);
  // Map each registered tool to the semantic category it serves, so dispatch can enforce the
  // CRUDE endpoint binding (#93). READ_TOOL serves READ; each gated tool serves its category.
  const categoryForTool = new Map<string, SemanticCategory>([
    [READ_TOOL, "READ"],
    ...enabledTools.map((t) => [t.name, t.category] as const),
  ]);

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = [
      {
        name: READ_TOOL,
        description:
          "Semantic READ endpoint for the MakerPerks builder-perks directory. " +
          'Call with { operation: "introspect" } to discover the available operations ' +
          "(list_programs, get_program, search_programs, get_application_flow, " +
          "list_application_flows, and any get_profile) and their parameters, then call those.",
        inputSchema: INPUT_SCHEMA,
      },
      ...enabledTools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: INPUT_SCHEMA,
      })),
    ];
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (!toolNames.has(request.params.name)) {
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
    const invokingCategory = categoryForTool.get(request.params.name);
    const result = await router.dispatch({ operation, params }, invokingCategory);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      isError: !result.success,
    };
  });

  return server;
}
