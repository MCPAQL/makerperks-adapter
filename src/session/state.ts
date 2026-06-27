// Per-session state substrate for the stateful endpoint (Stage 1). Each MCP session is a
// Durable Object (McpAgent) carrying one SessionState. The READ surface NEVER reads or
// writes it — the application pipeline (#17) and autonomy switch (#18) populate it. Kept
// as a pure, transport/runtime-free module so it is unit-testable off the Workers runtime.
// See openspec/changes/add-stateful-hosting (capability `stateful-session`, #25).

/**
 * Session-scoped state the MCP-AQL protocol does not persist itself (confirmation tokens
 * are session-scoped, not storage). This is the typed home the pipeline fills in; in this
 * change it stays empty because READ does not use it.
 */
export interface SessionState {
  /**
   * Single-use, time-limited, param-bound approvals for gated EXECUTE steps, keyed by
   * token id. Populated by the application pipeline (#17) + the autonomy switch (#18).
   */
  confirmationTokens: Record<string, unknown>;
  /**
   * In-flight EXECUTE / application context (pending -> running -> completed), keyed by
   * execution id. Populated by the application pipeline (#17).
   */
  executions: Record<string, unknown>;
}

/**
 * A fresh, empty SessionState. Each session gets its OWN — never a shared reference — so
 * state in one session can never leak into another.
 */
export function freshSessionState(): SessionState {
  return { confirmationTokens: {}, executions: {} };
}
