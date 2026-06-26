// MCP-AQL wire format — discriminated result + error codes.
// See docs/ARCHITECTURE.md §3 and the MCP-AQL spec (wire format).

export interface OkResult<T> {
  success: true;
  data: T;
}

export interface ErrResult {
  success: false;
  error: { code: ErrorCode; message: string; details?: Record<string, unknown> };
}

export type Result<T> = OkResult<T> | ErrResult;

export type ErrorCode =
  | "VALIDATION_MISSING_PARAM"
  | "VALIDATION_INVALID_TYPE"
  | "VALIDATION_UNKNOWN_PARAM"
  | "NOT_FOUND_OPERATION"
  | "NOT_FOUND_RESOURCE"
  | "INTERNAL_ERROR";

export interface AqlRequest {
  operation: string;
  params?: Record<string, unknown>;
}

export function ok<T>(data: T): OkResult<T> {
  return { success: true, data };
}

export function err(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ErrResult {
  return { success: false, error: { code, message, details } };
}
