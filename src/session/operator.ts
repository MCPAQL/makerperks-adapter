// Operator authorization (#90) — the zero-trust trust boundary. Every authenticated user is
// untrusted and may only propose; only the host/operator may accept into the served set. Operator
// status is host-configured: A) admin on a governing repo (read with the USER'S OWN token), or
// B) a static login allowlist; both can be set (OR'd); a single-user local deployment is implicitly
// an operator; a hosted deployment configuring neither fails SAFE (no operators). Pure +
// fetch-injectable so it is unit-testable off the Workers runtime. The resolver returns a boolean
// only — no credential is ever stored (see the OAuth-callback resolution in worker-stateful.ts).
// See openspec/changes/add-operator-authorization (capability `operator-authorization`).

import { fetchRepoAdmin } from "../auth/github.js";

export type OperatorPolicy =
  | { kind: "repo"; owner: string; repo: string } // A: admin on the governing repo
  | { kind: "allowlist"; logins: string[] } // B: login ∈ list
  | { kind: "both"; owner: string; repo: string; logins: string[] } // A OR B
  | { kind: "implicit" } // local/stdio single user — operator
  | { kind: "closed" }; // hosted, neither configured — fail safe (no operators)

/** Config the policy reads from — a subset of the worker Env (only these two keys matter here). */
export interface OperatorEnv {
  /** "owner/repo" — option A. Operator = admin on this repo (read with the user's own token). */
  OPERATOR_REPO?: string;
  /** Comma/space-separated GitHub logins — option B. Operator = login in this list. */
  OPERATOR_LOGINS?: string;
}

/** Parse an "owner/repo" string; undefined if malformed (so a typo fails safe, not half-open). */
function parseRepo(value: string): { owner: string; repo: string } | undefined {
  const parts = value.trim().split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return undefined;
  return { owner: parts[0], repo: parts[1] };
}

/** Split a logins list on commas/whitespace, dropping blanks. */
function parseLogins(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Derive the operator policy from config. `local` marks the single-user local/stdio deployment
 * (its lone user is implicitly the operator). A hosted deployment (`local` false) with neither key
 * configured is `closed` — fail safe.
 */
export function operatorPolicy(env: OperatorEnv, local = false): OperatorPolicy {
  if (local) return { kind: "implicit" };
  const repo = env.OPERATOR_REPO ? parseRepo(env.OPERATOR_REPO) : undefined;
  const logins = env.OPERATOR_LOGINS ? parseLogins(env.OPERATOR_LOGINS) : [];
  if (repo && logins.length > 0) {
    return { kind: "both", owner: repo.owner, repo: repo.repo, logins };
  }
  if (repo) return { kind: "repo", owner: repo.owner, repo: repo.repo };
  if (logins.length > 0) return { kind: "allowlist", logins };
  return { kind: "closed" };
}

/** The principal whose operator status is being resolved. `token` is needed only for option A. */
export interface OperatorPrincipal {
  login: string;
  /** The user's own OAuth token (option A reads repo permissions with it). */
  token?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Whether `principal` is an operator under `policy`. Option A reads repo admin with the principal's
 * OWN token (no server credential); option B is a pure list match (no outbound call); `implicit` is
 * always true; `closed` is always false. A missing token under a repo policy denies (cannot verify).
 */
export async function resolveOperator(
  policy: OperatorPolicy,
  principal: OperatorPrincipal,
): Promise<boolean> {
  switch (policy.kind) {
    case "implicit":
      return true;
    case "closed":
      return false;
    case "allowlist":
      return policy.logins.includes(principal.login);
    case "repo":
      return principal.token
        ? fetchRepoAdmin(
            policy.owner,
            policy.repo,
            principal.token,
            principal.fetchImpl,
          )
        : false;
    case "both": {
      if (policy.logins.includes(principal.login)) return true; // cheap match first
      return principal.token
        ? fetchRepoAdmin(
            policy.owner,
            policy.repo,
            principal.token,
            principal.fetchImpl,
          )
        : false;
    }
  }
}

/** Whether option A is active (the OAuth scope must be bumped to read repo permissions). */
export function policyNeedsRepoScope(policy: OperatorPolicy): boolean {
  return policy.kind === "repo" || policy.kind === "both";
}
