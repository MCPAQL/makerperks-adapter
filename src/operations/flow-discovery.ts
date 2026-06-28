// Flow-discovery toolkit (#47 piece C) — the model-free READ ops the server gives a connected
// LLM agent to investigate any perk: `get_discovery_brief` (the research scaffold) here, plus
// `verify_flow_proposal` / `diff_flow_proposal` (§2) and `start_flow_discovery` (§3). All are
// read-only (no state mutation) and depend only on `data` + `flows`, so the whole toolkit is
// available on every deployment including the read-only endpoint. The agent supplies the model +
// web; the server supplies the scaffold, the gates, and the diff. No provider SDK is a dependency.
// See openspec/changes/add-flow-discovery (capability `flow-discovery`).

import { ok, err } from "../core/wire.js";
import type { Router } from "../core/router.js";
import type { DataSource } from "../data/source.js";
import type { FlowSource } from "../data/flow-source.js";
import {
  buildDiscoveryBrief,
  collectProposalFindings,
  diffFlow,
} from "../data/discovery.js";
import type { CuratedFlow } from "../data/flows.js";

export function registerFlowDiscoveryOperations(
  router: Router,
  data: DataSource,
  flows: FlowSource,
): void {
  router.register({
    name: "get_discovery_brief",
    semanticCategory: "READ",
    description:
      "Get the research scaffold for discovering a perk's application flow: the perks.json " +
      "record, the derived baseline and its explicit `gaps` (what to confirm), the target Flow " +
      "Document contract (fields + allowed values), and the verification contract (provenance, " +
      "eligibility-surfaced, adversarial checklist). The connected agent researches against this " +
      "and produces a candidate Flow Document; the server supplies no model or web access.",
    params: {
      slug: {
        type: "string",
        required: true,
        description: "The program slug to discover, e.g. neon/neon-startup-program.",
      },
    },
    returns:
      "A discovery brief: `program`, `baseline`, `current`, `gaps`, `target` (contract), and " +
      "`verification_contract`.",
    handler: async (params) => {
      await data.ensureLoaded();
      await flows.ensureLoaded();
      const slug = params.slug as string;
      const program = data.programs().find((p) => p.slug === slug);
      if (!program) {
        return err("NOT_FOUND_RESOURCE", `no program with slug: ${slug}`, { slug });
      }
      return ok(buildDiscoveryBrief(program, flows));
    },
  });

  router.register({
    name: "verify_flow_proposal",
    semanticCategory: "READ",
    description:
      "Run the model-free gates on a candidate Flow Document: schema (the eval-free overlay " +
      "validator), provenance (a substantive candidate must carry a `source` and/or `sources[]` " +
      "plus a `verified` date), and eligibility-surfaced (eligibility encoded as data is flagged, " +
      "never asserted, and the perk is never hard-blocked). Returns a verdict plus the adversarial " +
      "checklist the agent must still execute. `ready_for_proposal` is the structural bar only — " +
      "not an acceptance decision (that is the proposed-flow queue, #47 piece D).",
    params: {
      slug: {
        type: "string",
        required: true,
        description: "The program slug the candidate is for.",
      },
      candidate: {
        type: "object",
        required: true,
        description:
          "The candidate Flow Document (a curated overlay record) to verify.",
      },
    },
    returns:
      "A verdict: `schema_valid`, `schema_errors`, `provenance_findings`, `eligibility_findings`, " +
      "`adversarial_checklist`, and `ready_for_proposal`.",
    handler: async (params) => {
      await data.ensureLoaded();
      const slug = params.slug as string;
      if (!data.programs().some((p) => p.slug === slug)) {
        return err("NOT_FOUND_RESOURCE", `no program with slug: ${slug}`, { slug });
      }
      return ok({ slug, ...collectProposalFindings(params.candidate) });
    },
  });

  router.register({
    name: "diff_flow_proposal",
    semanticCategory: "READ",
    description:
      "Diff a candidate Flow Document against the current curated overlay entry for the slug — " +
      "fields added, changed (with before/after), or removed — so a proposal's delta against what " +
      "is currently served is reviewable. With no current entry, every populated field is added.",
    params: {
      slug: {
        type: "string",
        required: true,
        description: "The program slug the candidate is for.",
      },
      candidate: {
        type: "object",
        required: true,
        description: "The candidate Flow Document (a curated overlay record) to diff.",
      },
    },
    returns: "A diff: `added`, `changed` (per field `{ from, to }`), and `removed`.",
    handler: async (params) => {
      await data.ensureLoaded();
      await flows.ensureLoaded();
      const slug = params.slug as string;
      if (!data.programs().some((p) => p.slug === slug)) {
        return err("NOT_FOUND_RESOURCE", `no program with slug: ${slug}`, { slug });
      }
      const current = flows.curatedFor(slug);
      return ok({ slug, ...diffFlow(params.candidate as CuratedFlow, current) });
    },
  });
}
