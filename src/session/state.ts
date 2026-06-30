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
  /** The vault credential id the approval was issued for (undefined when none) — bound so an
   * approval for one stored secret cannot authorize a different one on replay (#95). */
  credentialId?: string;
  issuedAt: number;
  expiresAt: number;
  used: boolean;
}

/** The maker's autonomy dial (#18) — how often the pipeline pauses for approval. */
export type AutonomyMode = "review_each" | "auto_low_risk" | "full_auto";
export type AutonomyDecision = "go" | "pause" | "stop";

export const AUTONOMY_MODES: readonly AutonomyMode[] = [
  "review_each",
  "auto_low_risk",
  "full_auto",
];

// Danger at/above this pauses for confirmation; below it proceeds. (danger >= 3 always stops.)
const GATE_BY_MODE: Record<AutonomyMode, number> = {
  review_each: 0, // pause every submission
  auto_low_risk: 2, // auto 0–1, escalate >= 2
  full_auto: 3, // auto 0–2; only the riskiest (>= 3) stop
};

/**
 * Map an autonomy mode + a step's danger level to a decision. `danger >= 3` (payment / real
 * identity) ALWAYS stops for an out-of-band challenge, regardless of mode. Pure policy — the
 * pipeline and the safety loop both call this, so they always agree.
 */
export function autonomyDecision(mode: AutonomyMode, danger: number): AutonomyDecision {
  if (danger >= 3) return "stop";
  return danger >= GATE_BY_MODE[mode] ? "pause" : "go";
}

/** Session-scoped state the MCP-AQL protocol does not persist itself. */
export interface SessionState {
  confirmationTokens: Record<string, ConfirmationToken>;
  executions: Record<string, Execution>;
  /** The autonomy dial (#18); fresh sessions start at the safest mode. */
  autonomy: AutonomyMode;
}

/**
 * A fresh SessionState. Each session gets its OWN — never a shared reference — so state in
 * one session can never leak into another. Autonomy defaults to the safest mode.
 */
export function freshSessionState(): SessionState {
  return { confirmationTokens: {}, executions: {}, autonomy: "review_each" };
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
