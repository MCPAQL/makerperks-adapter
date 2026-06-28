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
import { buildDiscoveryBrief } from "../data/discovery.js";

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
}
