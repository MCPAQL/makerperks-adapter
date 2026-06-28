// Transport-agnostic operation registry + dispatch.
// Imports NO transport. Built to accept more endpoint families later (EXECUTE).
// See docs/ARCHITECTURE.md §2.

import { err, type AqlRequest, type Result } from "./wire.js";

// CRUDE semantic categories. CREATE/UPDATE/DELETE realize the maker-profile entity (#34);
// each maps to its own `mcp_aql_*` tool, exposed only when an op of that category exists.
export type SemanticCategory = "CREATE" | "READ" | "UPDATE" | "DELETE" | "EXECUTE";

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

  /** Validate params (required, type, unknown), then dispatch to the handler. */
  async dispatch(req: AqlRequest): Promise<Result<unknown>> {
    const op = this.ops.get(req.operation);
    if (!op) {
      return err("NOT_FOUND_OPERATION", `unknown operation: ${req.operation}`, {
        operation: req.operation,
      });
    }

    const params = req.params ?? {};

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
