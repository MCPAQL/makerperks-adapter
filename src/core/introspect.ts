// Mandatory MCP-AQL introspection over the operation registry.
// Registered as a READ operation so clients discover capability at runtime.
// See docs/ARCHITECTURE.md §3.

import { ok, err, type Result } from "./wire.js";
import type { Operation, ParamSpec, Router } from "./router.js";

interface OperationInfo {
  name: string;
  semantic_category: string;
  description?: string;
  parameters: Array<{ name: string } & ParamSpec>;
  returns?: string;
}

function describe(op: Operation): OperationInfo {
  return {
    name: op.name,
    semantic_category: op.semanticCategory,
    description: op.description,
    parameters: Object.entries(op.params).map(([name, spec]) => ({ name, ...spec })),
    returns: op.returns,
  };
}

export function registerIntrospect(router: Router): void {
  router.register({
    name: "introspect",
    semanticCategory: "READ",
    description: "Discover available operations, their parameters, and return shapes.",
    params: {
      name: {
        type: "string",
        required: false,
        description: "Limit the result to a single operation by name.",
      },
    },
    returns: "An object with an `operations` array, or a single `operation`.",
    handler: async (params): Promise<Result<unknown>> => {
      const name = params.name as string | undefined;
      if (name !== undefined) {
        const op = router.get(name);
        if (!op) {
          return err("NOT_FOUND_OPERATION", `unknown operation: ${name}`, {
            operation: name,
          });
        }
        return ok({ operation: describe(op) });
      }
      return ok({ operations: router.list().map(describe) });
    },
  });
}
