// Transport-agnostic operation registry + dispatch.
// Imports NO transport. Built to accept more endpoint families later (EXECUTE).
// See docs/ARCHITECTURE.md §2.

import type { AqlRequest, Result } from "./wire.js";

export type SemanticCategory = "READ"; // CREATE/UPDATE/DELETE/EXECUTE added in Stage 1.

export type Handler = (params: Record<string, unknown>) => Promise<Result<unknown>>;

export interface Operation {
  name: string;
  semanticCategory: SemanticCategory;
  handler: Handler;
  // TODO(task 3.1): declared param schema (required / type) for validation + introspection.
}

export class Router {
  private readonly ops = new Map<string, Operation>();

  register(op: Operation): void {
    this.ops.set(op.name, op);
  }

  has(name: string): boolean {
    return this.ops.has(name);
  }

  list(): Operation[] {
    return [...this.ops.values()];
  }

  // TODO(task 3.1): validate params (required, type, reject unknown ->
  // VALIDATION_UNKNOWN_PARAM), then dispatch to the handler.
  async dispatch(_req: AqlRequest): Promise<Result<unknown>> {
    throw new Error("not implemented (task 3.1)");
  }
}
