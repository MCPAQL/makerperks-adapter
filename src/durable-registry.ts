// The SHARED, operator-curated proposed-flow registry Durable Object (#47 piece D §3). A SINGLE
// named instance (`idFromName("flow-registry")`) holds the review queue, the accepted overlay, and
// the acceptance-mode dial for the whole deployment — distinct from the per-USER MakerProfileDO.
// Chosen over D1/KV on the merits (see openspec/changes/add-flow-acceptance/design.md §1): strongly
// consistent + transactional (the accept moves pending→accepted AND publishes in one method, which
// runs under the DO's input gate without interleaving), reuses the existing DO pattern, no new
// infra. The session worker drives it via a stub to back a `FlowRegistry`. See capability
// `flow-acceptance`.

import { DurableObject } from "cloudflare:workers";
import type { CuratedFlows } from "./data/flows.js";
import {
  applyProposalFilter,
  type AcceptanceMode,
  type Proposal,
  type ProposalFilter,
} from "./session/flow-registry.js";

const MODE_KEY = "mode";
const PROPOSALS_KEY = "proposals";
const ACCEPTED_KEY = "accepted";

export class FlowRegistryDO extends DurableObject {
  async getMode(): Promise<AcceptanceMode> {
    return (await this.ctx.storage.get<AcceptanceMode>(MODE_KEY)) ?? "review_each";
  }

  async setMode(mode: AcceptanceMode): Promise<void> {
    await this.ctx.storage.put(MODE_KEY, mode);
  }

  private async proposals(): Promise<Record<string, Proposal>> {
    return (await this.ctx.storage.get<Record<string, Proposal>>(PROPOSALS_KEY)) ?? {};
  }

  async putProposal(proposal: Proposal): Promise<void> {
    const map = await this.proposals();
    map[proposal.id] = proposal;
    await this.ctx.storage.put(PROPOSALS_KEY, map);
  }

  async getProposal(id: string): Promise<Proposal | undefined> {
    return (await this.proposals())[id];
  }

  async listProposals(filter?: ProposalFilter): Promise<Proposal[]> {
    return applyProposalFilter(Object.values(await this.proposals()), filter);
  }

  /** Decide a proposal; on `accepted`, publish its candidate into the accepted overlay. Both
   * writes happen inside this one method, so the DO input gate makes the accept atomic. */
  async decide(
    id: string,
    status: "accepted" | "rejected",
    reason?: string,
  ): Promise<Proposal> {
    const map = await this.proposals();
    const existing = map[id];
    if (!existing) throw new Error(`no proposal: ${id}`);
    const decided: Proposal = { ...existing, status, decidedAt: Date.now() };
    if (reason !== undefined) decided.reason = reason;
    map[id] = decided;
    if (status === "accepted") {
      const accepted = (await this.ctx.storage.get<CuratedFlows>(ACCEPTED_KEY)) ?? {};
      accepted[existing.slug] = existing.candidate;
      await this.ctx.storage.put(ACCEPTED_KEY, accepted);
    }
    await this.ctx.storage.put(PROPOSALS_KEY, map);
    return decided;
  }

  async getAccepted(): Promise<CuratedFlows> {
    return (await this.ctx.storage.get<CuratedFlows>(ACCEPTED_KEY)) ?? {};
  }
}
