// Mandatory MCP-AQL introspection over the operation registry.
// See docs/ARCHITECTURE.md §3.

import type { Router } from "./router.js";

// TODO(task 3.5): return operations (+ a single named operation), with params and
// return shapes, so clients discover capability at runtime.
export function introspect(_router: Router): unknown {
  throw new Error("not implemented (task 3.5)");
}
