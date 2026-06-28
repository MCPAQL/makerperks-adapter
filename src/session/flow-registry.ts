// Shared, operator-curated proposed-flow registry (#47 piece D). The home for the review queue +
// the accepted overlay that piece-C proposals pass through. This is SHARED/operator state — one
// registry per deployment — unlike the per-user ProfileStore. Kept pure + runtime-free so it is
// unit-testable off the Workers runtime, exactly like session/profile.ts; a single named registry
// Durable Object backs it on the hosted worker (§3). The queue is generic over `kind` so the #35
// service-submission queue reuses the same machinery.
// See openspec/changes/add-flow-acceptance (capability `flow-acceptance`).

import type { CuratedFlow, CuratedFlows } from "../data/flows.js";
import type { ProposalVerdict } from "../data/discovery.js";

export type ProposalKind = "flow"; // "service" later (#35) — the queue machinery is generic
export type ProposalStatus = "pending" | "accepted" | "rejected";

export const ACCEPTANCE_MODES = ["review_each", "auto_low_risk", "full_auto"] as const;
export type AcceptanceMode = (typeof ACCEPTANCE_MODES)[number];

export interface Proposal {
  id: string;
  kind: ProposalKind;
  slug: string;
  /** The program's provider, denormalized for filtering. */
  provider: string;
  /** The proposed Flow Document (a curated overlay record). */
  candidate: CuratedFlow;
  /** The agent's semantic adversarial-refutation result — metadata a human reviews; not trusted. */
  attestation?: string;
  /** The server's OWN re-run of the model-free verify gate (piece C) — authoritative. */
  verdict: ProposalVerdict;
  /** The candidate's danger level (or 0), for the acceptance dial + filtering. */
  danger_level: number;
  status: ProposalStatus;
  /** Rejection reason. */
  reason?: string;
  proposedAt: number;
  decidedAt?: number;
}

export interface ProposalFilter {
  status?: ProposalStatus;
  provider?: string;
  /** Minimum danger level (inclusive). */
  minDanger?: number;
}

/**
 * The shared registry: the proposal queue, the accepted overlay, and the acceptance-mode dial.
 * One per deployment (operator-scoped). The hosted impl is a single named Durable Object (§3); the
 * in-memory impl backs local mode + tests. Acceptance gating (verdict + danger floors) lives in
 * the OPERATION layer, not here — the store just persists and, on accept, publishes the overlay.
 */
export interface FlowRegistry {
  mode(): Promise<AcceptanceMode>;
  setMode(mode: AcceptanceMode): Promise<void>;
  /** Create or replace a proposal (CREATE / UPDATE of a pending one). */
  put(proposal: Proposal): Promise<void>;
  get(id: string): Promise<Proposal | undefined>;
  list(filter?: ProposalFilter): Promise<Proposal[]>;
  /** Mark a proposal decided; on `accepted`, publish its candidate into the accepted overlay. */
  decide(
    id: string,
    status: "accepted" | "rejected",
    reason?: string,
  ): Promise<Proposal>;
  /** The accepted overlay (slug → CuratedFlow) — the highest-precedence serving layer. */
  accepted(): Promise<CuratedFlows>;
}

/**
 * An in-process FlowRegistry for local mode + tests. Operator-shared within the process; never
 * transmitted. Cross-restart persistence is the hosted Durable Object's job (§3).
 */
export function inMemoryFlowRegistry(): FlowRegistry {
  let mode: AcceptanceMode = "review_each";
  const proposals = new Map<string, Proposal>();
  const accepted: CuratedFlows = {};
  return {
    mode: async () => mode,
    setMode: async (m) => {
      mode = m;
    },
    put: async (p) => {
      proposals.set(p.id, p);
    },
    get: async (id) => proposals.get(id),
    list: async (f) => {
      let out = [...proposals.values()];
      if (f?.status) out = out.filter((p) => p.status === f.status);
      if (f?.provider) out = out.filter((p) => p.provider === f.provider);
      if (f?.minDanger !== undefined)
        out = out.filter((p) => p.danger_level >= f.minDanger!);
      return out.sort((a, b) => a.proposedAt - b.proposedAt);
    },
    decide: async (id, status, reason) => {
      const p = proposals.get(id);
      if (!p) throw new Error(`no proposal: ${id}`);
      const decided: Proposal = { ...p, status, decidedAt: Date.now() };
      if (reason !== undefined) decided.reason = reason;
      proposals.set(id, decided);
      if (status === "accepted") accepted[p.slug] = p.candidate; // publish, highest precedence
      return decided;
    },
    accepted: async () => ({ ...accepted }),
  };
}
