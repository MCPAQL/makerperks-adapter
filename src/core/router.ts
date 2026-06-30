// Transport-agnostic operation registry + dispatch.
// Imports NO transport. Built to accept more endpoint families later (EXECUTE).
// See docs/ARCHITECTURE.md §2.

import { err, type AqlRequest, type Result } from "./wire.js";

// CRUDE semantic categories. CREATE/UPDATE/DELETE realize the maker-profile entity (#34);
// each maps to its own `mcp_aql_*` tool, exposed only when an op of that category exists.
export type SemanticCategory = "CREATE" | "READ" | "UPDATE" | "DELETE" | "EXECUTE";

// The CRUDE tool each semantic category is served through (CRUDE mode). Used to name the
// correct endpoint in a VALIDATION_ENDPOINT_MISMATCH error.
export const TOOL_FOR_CATEGORY: Record<SemanticCategory, string> = {
  CREATE: "mcp_aql_create",
  READ: "mcp_aql_read",
  UPDATE: "mcp_aql_update",
  DELETE: "mcp_aql_delete",
  EXECUTE: "mcp_aql_execute",
};

export type ParamType = "string" | "number" | "boolean" | "string[]" | "object";

export interface ParamSpec {
  type: ParamType;
  required?: boolean;
  description?: string;
  enum?: readonly string[];
}

export type Handler = (params: Record<string, unknown>) => Promise<Result<unknown>>;

export interface Operation {
  name: string;
  semanticCategory: SemanticCategory;
  description?: string;
  params: Record<string, ParamSpec>;
  returns?: string;
  handler: Handler;
  /**
   * Reserved discovery/protocol op reachable from every CRUDE endpoint (e.g. `introspect`).
   * When true, `dispatchFromEndpoint` skips the endpoint-binding check for this op.
   */
  anyEndpoint?: boolean;
}

function matchesType(value: unknown, type: ParamType): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "string[]":
      return Array.isArray(value) && value.every((v) => typeof v === "string");
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}

export class Router {
  private readonly ops = new Map<string, Operation>();

  register(op: Operation): void {
    if (this.ops.has(op.name)) {
      throw new Error(`duplicate operation: ${op.name}`);
    }
    this.ops.set(op.name, op);
  }

  has(name: string): boolean {
    return this.ops.has(name);
  }

  get(name: string): Operation | undefined {
    return this.ops.get(name);
  }

  list(): Operation[] {
    return [...this.ops.values()];
  }

  /**
   * Trusted in-process dispatch: validate params and run the handler, with NO endpoint-binding
   * check. For calls that did not arrive through a CRUDE endpoint (in-process orchestration,
   * tests). A request that crosses a transport boundary MUST go through `dispatchFromEndpoint`
   * instead, so the endpoint↔operation binding is enforced.
   */
  async dispatch(req: AqlRequest): Promise<Result<unknown>> {
    const op = this.ops.get(req.operation);
    if (!op) {
      return err("NOT_FOUND_OPERATION", `unknown operation: ${req.operation}`, {
        operation: req.operation,
      });
    }
    return this.run(op, req.params ?? {});
  }

  /**
   * Endpoint-boundary dispatch (spec crude-pattern §5, operations §6.3). `endpoint` is the
   * semantic category of the CRUDE tool the request arrived on; it is REQUIRED so a transport
   * cannot silently skip the check. An operation whose `semanticCategory` differs is REJECTED
   * with VALIDATION_ENDPOINT_MISMATCH before any param validation or side effect. Ops flagged
   * `anyEndpoint` (e.g. `introspect`) are reachable from every endpoint.
   */
  async dispatchFromEndpoint(
    req: AqlRequest,
    endpoint: SemanticCategory,
  ): Promise<Result<unknown>> {
    const op = this.ops.get(req.operation);
    if (!op) {
      return err("NOT_FOUND_OPERATION", `unknown operation: ${req.operation}`, {
        operation: req.operation,
      });
    }

    if (!op.anyEndpoint && op.semanticCategory !== endpoint) {
      return err(
        "VALIDATION_ENDPOINT_MISMATCH",
        `Operation '${op.name}' must be called via ${TOOL_FOR_CATEGORY[op.semanticCategory]}, not ${TOOL_FOR_CATEGORY[endpoint]}`,
        {
          operation: op.name,
          expected_endpoint: op.semanticCategory,
          actual_endpoint: endpoint,
        },
      );
    }

    return this.run(op, req.params ?? {});
  }

  /** Validate params (unknown, required, type, enum), then invoke the handler. */
  private async run(
    op: Operation,
    params: Record<string, unknown>,
  ): Promise<Result<unknown>> {
    for (const key of Object.keys(params)) {
      if (!(key in op.params)) {
        return err("VALIDATION_UNKNOWN_PARAM", `unknown parameter: ${key}`, {
          operation: op.name,
          param: key,
        });
      }
    }

    for (const [name, spec] of Object.entries(op.params)) {
      const value = params[name];
      if (value === undefined) {
        if (spec.required) {
          return err(
            "VALIDATION_MISSING_PARAM",
            `missing required parameter: ${name}`,
            {
              operation: op.name,
              param: name,
            },
          );
        }
        continue;
      }
      if (!matchesType(value, spec.type)) {
        return err(
          "VALIDATION_INVALID_TYPE",
          `parameter ${name} must be ${spec.type}`,
          {
            operation: op.name,
            param: name,
          },
        );
      }
      if (spec.enum && !spec.enum.includes(value as string)) {
        return err(
          "VALIDATION_INVALID_TYPE",
          `parameter ${name} must be one of: ${spec.enum.join(", ")}`,
          { operation: op.name, param: name },
        );
      }
    }

    return op.handler(params);
  }
}
