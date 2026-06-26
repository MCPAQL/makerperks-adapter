// stdio transport binding (default). Thin layer over the transport-agnostic core.
// TODO(task 4.1): wire @modelcontextprotocol/sdk StdioServerTransport to router.dispatch.
// See docs/ARCHITECTURE.md §2.

import type { Router } from "../core/router.js";

export async function startStdio(_router: Router): Promise<void> {
  throw new Error("not implemented (task 4.1)");
}
