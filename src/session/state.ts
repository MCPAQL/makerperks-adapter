// Per-session state substrate for the application pipeline (Stage 1). Each MCP session is a
// Durable Object (McpAgent) carrying one SessionState; over stdio it is in-process. The READ
// surface never touches it — the EXECUTE pipeline (#17) does. Kept pure and
// transport/runtime-free so it is unit-testable off the Workers runtime.
// See openspec/changes/add-stateful-hosting (#25) and add-application-pipeline (#17).

/** The ordered stages of a (simulated) application lifecycle. */
export type ExecutionStage =
  | "eligibility"
  | "assemble"
  | "submission"
  | "verification"
  | "redeem"
  | "done";

export type ExecutionStatus = "pending" | "running" | "halted" | "completed" | "failed";

/** An in-flight (or finished) application run, keyed in SessionState by its id. */
export interface Execution {
  id: string;
  slug: string;
  stage: ExecutionStage;
  status: ExecutionStatus;
  /** Inputs gathered per call (the persistent profile/vault is #19/#34). */
  inputs: Record<string, unknown>;
  /** Human-readable trail of what happened (incl. simulated submissions). */
  log: string[];
  createdAt: number;
}

/** A single-use, time-limited, param-bound approval for a gated step. */
export interface ConfirmationToken {
  token: string;
  executionId: string;
  stage: ExecutionStage;
  /** Hash binding the token to the inputs it was issued for. */
  paramsHash: string;
  issuedAt: number;
  expiresAt: number;
  used: boolean;
}

/** Session-scoped state the MCP-AQL protocol does not persist itself. */
export interface SessionState {
  confirmationTokens: Record<string, ConfirmationToken>;
  executions: Record<string, Execution>;
}

/**
 * A fresh, empty SessionState. Each session gets its OWN — never a shared reference — so
 * state in one session can never leak into another.
 */
export function freshSessionState(): SessionState {
  return { confirmationTokens: {}, executions: {} };
}

/**
 * How EXECUTE handlers read and persist this session's state. Backed by the Durable Object
 * (`{ get: () => this.state, set: (s) => this.setState(s) }`) on the stateful endpoint, and
 * by an in-memory closure over stdio (the local personal-tool mode). The live stateless
 * READ-only worker passes no store, so no EXECUTE ops are registered there.
 */
export interface SessionStore {
  get(): SessionState;
  set(next: SessionState): void | Promise<void>;
}

/** An in-process SessionStore — single session per process (stdio / tests / local mode). */
export function inMemorySessionStore(
  initial: SessionState = freshSessionState(),
): SessionStore {
  let state = initial;
  return {
    get: () => state,
    set: (next) => {
      state = next;
    },
  };
}
