// stdio transport binding (default). Thin layer over the transport-agnostic core.
// See docs/ARCHITECTURE.md §2.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "../mcp.js";
import type { Router } from "../core/router.js";

export async function startStdio(router: Router): Promise<void> {
  const server = createMcpServer(router);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
