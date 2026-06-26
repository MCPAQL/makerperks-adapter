// Streamable HTTP transport binding. Thin layer over the transport-agnostic core.
// TODO(task 4.2): wire @modelcontextprotocol/sdk StreamableHTTPServerTransport —
// single endpoint, optional SSE, Mcp-Session-Id sessions, Origin validation.
// NOT the deprecated HTTP+SSE transport. See docs/ARCHITECTURE.md §2.

import type { Router } from "../core/router.js";

export async function startHttp(
  _router: Router,
  _opts: { port?: number } = {},
): Promise<void> {
  throw new Error("not implemented (task 4.2)");
}
