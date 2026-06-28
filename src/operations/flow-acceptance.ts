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
import type { CuratedFlow } from "../data/flows.js";
import {
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

/** A list view of a proposal: the queue fields + the diff vs the currently-served curated overlay. */
function proposalView(p: Proposal, flows: FlowSource) {
  return {
    id: p.id,
    slug: p.slug,
    provider: p.provider,
    status: p.status,
    danger_level: p.danger_level,
    ready_for_proposal: p.verdict.ready_for_proposal,
    verdict: p.verdict,
    attestation: p.attestation,
    proposedAt: p.proposedAt,
    decidedAt: p.decidedAt,
    reason: p.reason,
    diff: diffFlow(p.candidate, flows.curatedFor(p.slug)),
  };
}

export function registerFlowAcceptanceOperations(
  router: Router,
  data: DataSource,
  flows: FlowSource,
  registry: FlowRegistry,
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
      };
      if (params.attestation !== undefined) {
        proposal.attestation = params.attestation as string;
      }
      await registry.put(proposal);
      return ok({ id: proposal.id, status: proposal.status, verdict });
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
      const proposals = await registry.list({
        status: params.status as ProposalStatus | undefined,
        provider: params.provider as string | undefined,
        minDanger: params.min_danger as number | undefined,
      });
      const view = proposals.map((p) => proposalView(p, flows));
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
}
