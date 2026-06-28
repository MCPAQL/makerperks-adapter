// Flow discovery (#47 piece C) — the MODEL-FREE pieces of the research→generate→verify→propose
// loop. The server is the substrate (no web, no model, runs on Workers); it hands a connected
// LLM agent a research **brief** to investigate against, and (in §2/§3) the schema/provenance/
// eligibility gates, the overlay diff, and a fidelity oracle. The agent supplies the model + web.
// No provider SDK is a dependency. See openspec/changes/add-flow-discovery (capability
// `flow-discovery`).

import {
  deriveFlow,
  getApplicationFlow,
  curatedFlowContract,
  type ApplicationFlow,
  type CuratedFlowContract,
} from "./flows.js";
import type { PerkProgram } from "./source.js";
import type { FlowSource } from "./flow-source.js";

// The static adversarial checks the agent must execute SEMANTICALLY (the server hands over the
// contract; refutation needs a model, so it stays the agent's job). Surfaced in the brief and by
// `verify_flow_proposal` (§2).
export const ADVERSARIAL_CHECKLIST: readonly string[] = [
  "Re-fetch each sources[] URL and confirm it actually supports the claim it backs.",
  "Confirm submission.action_url is the real apply/signup page, not the provider homepage carried over from the baseline.",
  "Confirm no eligibility criterion is recorded as satisfied — eligibility belongs in gaps, never asserted.",
  "Confirm danger_level is justified by the submission (payment or real-identity steps raise it).",
  "Confirm every non-obvious curated field carries a sources[] entry; move anything you could not source to gaps.",
];

export interface DiscoveryBrief {
  slug: string;
  /** The published perks.json record — the raw facts to research from. */
  program: PerkProgram;
  /** The heuristic baseline (deriveFlow) — a low-confidence starting point. */
  baseline: ApplicationFlow;
  /** The currently-served flow (curated overlay if any, else == baseline) — what re-discovery replaces. */
  current: ApplicationFlow;
  /** The baseline's explicit unknowns — what the agent must confirm against the provider. */
  gaps: string[];
  /** The target Flow Document contract (field names + allowed enums) — what `verify` accepts. */
  target: CuratedFlowContract;
  verification_contract: {
    provenance: string;
    eligibility: string;
    adversarial_checklist: readonly string[];
  };
}

/**
 * Build the research scaffold an agent investigates against. Pure: a function of the program +
 * the loaded overlay — no web, no model. Callers must `ensureLoaded()` the FlowSource first.
 */
export function buildDiscoveryBrief(
  program: PerkProgram,
  flows: FlowSource,
): DiscoveryBrief {
  const baseline = deriveFlow(program);
  return {
    slug: program.slug,
    program,
    baseline,
    current: getApplicationFlow(program, flows),
    gaps: baseline.gaps,
    target: curatedFlowContract(),
    verification_contract: {
      provenance:
        "Every non-derived claim must cite a source URL in sources[]; anything you cannot source " +
        "belongs in gaps — never record a guess as a fact.",
      eligibility:
        "Eligibility criteria are surfaced in gaps for the maker to verify; never assert them as " +
        "satisfied, and never auto-deny or hard-block the perk.",
      adversarial_checklist: ADVERSARIAL_CHECKLIST,
    },
  };
}
