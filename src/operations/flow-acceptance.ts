// Flow-acceptance toolkit (#47 piece D) — the CRUDE proposed-flow review queue + (in §2) the
// acceptance autonomy dial. A connected agent (or operator) submits a verified Flow Document from
// piece C; the server RE-RUNS the model-free verify gate authoritatively, queues it, and a human
// or the dial accepts it into the live overlay. All bound to a shared FlowRegistry, so the ops
// register only where one is wired (local + the stateful endpoint), never on the read-only worker.
// See openspec/changes/add-flow-acceptance (capability `flow-acceptance`).

import { ok, err } from "../core/wire.js";
import type { Router } from "../core/router.js";
import type { DataSource } from "../data/source.js";
import type { FlowSource } from "../data/flow-source.js";
import { collectProposalFindings, diffFlow } from "../data/discovery.js";
import { statusProposalCheck } from "../data/status.js";
import type { CuratedFlow, CuratedFlows } from "../data/flows.js";
import type { ProfileStore } from "../session/profile.js";
import {
  ACCEPTANCE_MODES,
  type AcceptanceMode,
  type FlowRegistry,
  type Proposal,
  type ProposalStatus,
} from "../session/flow-registry.js";

const STATUSES = ["pending", "accepted", "rejected"] as const;

/** The candidate's declared danger level (0 when absent or invalid) — drives the dial + filtering. */
function dangerOf(candidate: CuratedFlow): number {
  const d = (candidate as { danger_level?: unknown }).danger_level;
  return typeof d === "number" && [0, 1, 2, 3, 4].includes(d) ? d : 0;
}

/**
 * Whether a proposal auto-accepts at submission under the dial. In every mode it must be
 * `ready` (so eligibility, which blocks readiness, is never auto-asserted) and `danger ≤ 2`
 * (danger ≥ 3 — payment / real identity — always waits for an explicit human `accept_flow`):
 * review_each never auto-accepts; auto_low_risk accepts danger ≤ 1; full_auto accepts danger ≤ 2.
 */
function autoAccepts(mode: AcceptanceMode, ready: boolean, danger: number): boolean {
  if (!ready || danger >= 3) return false;
  if (mode === "auto_low_risk") return danger <= 1;
  if (mode === "full_auto") return danger <= 2;
  return false; // review_each
}

/** A list view of a proposal: the queue fields + the diff vs the currently-served curated overlay. */
function proposalView(p: Proposal, flows: FlowSource, accepted?: CuratedFlows) {
  const served = accepted?.[p.slug] ?? flows.curatedFor(p.slug);
  return {
    id: p.id,
    slug: p.slug,
    provider: p.provider,
    proposed_by: p.proposed_by,
    status: p.status,
    danger_level: p.danger_level,
    ready_for_proposal: p.verdict.ready_for_proposal,
    verdict: p.verdict,
    attestation: p.attestation,
    proposedAt: p.proposedAt,
    decidedAt: p.decidedAt,
    reason: p.reason,
    diff: diffFlow(p.candidate, served),
  };
}

export function registerFlowAcceptanceOperations(
  router: Router,
  data: DataSource,
  flows: FlowSource,
  registry: FlowRegistry,
  // The authenticated subject of the session, stamped onto proposals as `proposed_by` (#73). Set
  // by the server from the session identity — never a caller param. Undefined → unattributed.
  proposer?: string,
  // The per-user store, for the proposer's status policy (#36): block refuses a proposal, flag
  // surfaces a non-blocking finding. Undefined → the DEFAULT policy (flag non-Active, block none).
  store?: ProfileStore,
): void {
  router.register({
    name: "propose_flow",
    semanticCategory: "CREATE",
    description:
      "Submit a discovered/updated Flow Document (a curated overlay record) to the review queue. " +
      "The server RE-RUNS the model-free verify gate (schema + provenance + eligibility) itself — " +
      "it does not trust a caller-supplied verdict — stamps the result, and stores the proposal as " +
      "`pending` (or auto-accepts it per the acceptance mode; danger >= 3 always waits for a human).",
    params: {
      slug: {
        type: "string",
        required: true,
        description: "The program slug the proposed flow is for.",
      },
      candidate: {
        type: "object",
        required: true,
        description: "The proposed Flow Document (a curated overlay record).",
      },
      attestation: {
        type: "string",
        required: false,
        description:
          "Optional: the agent's semantic adversarial-refutation result, recorded for a human " +
          "reviewer (metadata only — never trusted in place of the server's own verify).",
      },
    },
    returns:
      "An object with the proposal `id`, `status`, and the server-computed `verdict`.",
    handler: async (params) => {
      await data.ensureLoaded();
      const slug = params.slug as string;
      const program = data.programs().find((p) => p.slug === slug);
      if (!program) {
        return err("NOT_FOUND_RESOURCE", `no program with slug: ${slug}`, { slug });
      }
      // Apply the proposer's status policy (#36): block refuses; flag surfaces a non-blocking finding.
      const stored = store ? (await store.get())?.statusPolicy : undefined;
      const { gate, finding } = statusProposalCheck(program, stored);
      if (gate === "block") {
        return err("CONFLICT_EXISTS", finding!, { slug, status: program.status });
      }
      const statusExtra = finding ? { status_finding: finding } : {};
      const candidate = params.candidate as CuratedFlow;
      const verdict = collectProposalFindings(candidate);
      const proposal: Proposal = {
        id: crypto.randomUUID(),
        kind: "flow",
        slug,
        provider: program.provider,
        candidate,
        verdict,
        danger_level: dangerOf(candidate),
        status: "pending",
        proposedAt: Date.now(),
        ...(proposer !== undefined ? { proposed_by: proposer } : {}),
      };
      if (params.attestation !== undefined) {
        proposal.attestation = params.attestation as string;
      }
      await registry.put(proposal);
      // The acceptance dial may auto-accept an eligible proposal at submission (review_each never
      // does; danger ≥ 3 + not-ready never do — see autoAccepts).
      if (
        autoAccepts(
          await registry.mode(),
          verdict.ready_for_proposal,
          proposal.danger_level,
        )
      ) {
        const decided = await registry.decide(proposal.id, "accepted");
        return ok({
          id: proposal.id,
          status: decided.status,
          verdict,
          auto_accepted: true,
          ...statusExtra,
        });
      }
      return ok({ id: proposal.id, status: proposal.status, verdict, ...statusExtra });
    },
  });

  router.register({
    name: "list_proposed_flows",
    semanticCategory: "READ",
    description:
      "List proposals in the review queue with their server-computed verdict and a diff against " +
      "the currently-served curated overlay. Filter by status (pending/accepted/rejected), " +
      "provider, or minimum danger level.",
    params: {
      status: {
        type: "string",
        required: false,
        enum: STATUSES,
        description: "Filter by status.",
      },
      provider: {
        type: "string",
        required: false,
        description: "Filter by provider.",
      },
      min_danger: {
        type: "number",
        required: false,
        description: "Only proposals with danger_level >= this value.",
      },
    },
    returns: "An object with `count` and `proposals` (each with its verdict + diff).",
    handler: async (params) => {
      await flows.ensureLoaded();
      const accepted = await registry.accepted();
      const proposals = await registry.list({
        status: params.status as ProposalStatus | undefined,
        provider: params.provider as string | undefined,
        minDanger: params.min_danger as number | undefined,
      });
      const view = proposals.map((p) => proposalView(p, flows, accepted));
      return ok({ count: view.length, proposals: view });
    },
  });

  router.register({
    name: "update_proposed_flow",
    semanticCategory: "UPDATE",
    description:
      "Revise a still-pending proposal with a new candidate Flow Document. The server re-runs the " +
      "verify gate on the new candidate and keeps the proposal pending.",
    params: {
      id: {
        type: "string",
        required: true,
        description: "The proposal id to revise.",
      },
      candidate: {
        type: "object",
        required: true,
        description: "The revised Flow Document (a curated overlay record).",
      },
    },
    returns:
      "An object with the proposal `id`, `status`, and the re-computed `verdict`.",
    handler: async (params) => {
      const id = params.id as string;
      const existing = await registry.get(id);
      if (!existing) {
        return err("NOT_FOUND_RESOURCE", `no proposal with id: ${id}`, { id });
      }
      if (existing.status !== "pending") {
        return err(
          "CONFLICT_EXISTS",
          `proposal ${id} is ${existing.status}, not pending — cannot revise`,
          { id, status: existing.status },
        );
      }
      const candidate = params.candidate as CuratedFlow;
      const verdict = collectProposalFindings(candidate);
      const updated: Proposal = {
        ...existing,
        candidate,
        verdict,
        danger_level: dangerOf(candidate),
      };
      await registry.put(updated);
      return ok({ id, status: updated.status, verdict });
    },
  });

  router.register({
    name: "reject_flow",
    semanticCategory: "DELETE",
    description: "Discard a proposal from the review queue with a reason.",
    params: {
      id: {
        type: "string",
        required: true,
        description: "The proposal id to reject.",
      },
      reason: {
        type: "string",
        required: false,
        description: "A short non-secret reason for the rejection.",
      },
    },
    returns:
      "An object with the proposal `id`, `status` (`rejected`), and the `reason`.",
    handler: async (params) => {
      const id = params.id as string;
      const existing = await registry.get(id);
      if (!existing) {
        return err("NOT_FOUND_RESOURCE", `no proposal with id: ${id}`, { id });
      }
      const decided = await registry.decide(
        id,
        "rejected",
        params.reason as string | undefined,
      );
      return ok({ id, status: decided.status, reason: decided.reason });
    },
  });

  router.register({
    name: "accept_flow",
    semanticCategory: "UPDATE",
    description:
      "Explicitly accept a pending proposal into the served overlay (the human-review path, and " +
      "the only path for danger >= 3). Re-checks the server verdict is `ready_for_proposal`; on " +
      "accept, atomically marks the proposal accepted and publishes its candidate so the flow is " +
      "served live. A not-ready proposal is not accepted and nothing is published.",
    params: {
      id: {
        type: "string",
        required: true,
        description: "The proposal id to accept.",
      },
    },
    returns:
      "An object with `id`, `accepted` (boolean), `status`, and — when not accepted — the `verdict`.",
    handler: async (params) => {
      const id = params.id as string;
      const existing = await registry.get(id);
      if (!existing) {
        return err("NOT_FOUND_RESOURCE", `no proposal with id: ${id}`, { id });
      }
      if (existing.status !== "pending") {
        return err(
          "CONFLICT_EXISTS",
          `proposal ${id} is ${existing.status}, not pending`,
          { id, status: existing.status },
        );
      }
      if (!existing.verdict.ready_for_proposal) {
        // Surfaced, never asserted: a not-ready proposal (e.g. unresolved eligibility) is not
        // published. Fix it via update_proposed_flow.
        return ok({
          id,
          accepted: false,
          status: existing.status,
          reason: "not ready for proposal",
          verdict: existing.verdict,
        });
      }
      const decided = await registry.decide(id, "accepted");
      return ok({ id, accepted: true, status: decided.status });
    },
  });

  router.register({
    name: "set_acceptance_mode",
    semanticCategory: "UPDATE",
    description:
      "Set the acceptance autonomy mode for the proposed-flow queue: review_each (default — a " +
      "human accepts every proposal), auto_low_risk (auto-accept ready danger <= 1), or full_auto " +
      "(auto-accept ready danger <= 2). In every mode the verify gate runs, eligibility is never " +
      "auto-asserted, and danger >= 3 always waits for an explicit human accept.",
    params: {
      mode: {
        type: "string",
        required: true,
        enum: ACCEPTANCE_MODES,
        description: "review_each | auto_low_risk | full_auto.",
      },
    },
    returns: "An object with the set `mode`.",
    handler: async (params) => {
      const mode = params.mode as AcceptanceMode;
      await registry.setMode(mode);
      return ok({ mode });
    },
  });

  router.register({
    name: "get_acceptance_mode",
    semanticCategory: "READ",
    description: "Read the acceptance autonomy mode for the proposed-flow queue.",
    params: {},
    returns: "An object with the current `mode`.",
    handler: async () => ok({ mode: await registry.mode() }),
  });
}
