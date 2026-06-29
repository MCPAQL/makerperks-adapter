// CRUDE READ family for application flows: get_application_flow / list_application_flows.
// Read-only and additive — the existing READ ops are unchanged. Returns the merged flow
// (curated overlay over derived baseline) with explicit `gaps`, so an agent can discover
// what it takes to apply and what it must still figure out. See docs + the
// `application-flows` spec (#16 §3).

import { ok, err } from "../core/wire.js";
import type { Router } from "../core/router.js";
import type { DataSource } from "../data/source.js";
import type { FlowSource } from "../data/flow-source.js";
import { getApplicationFlow, freshness, type Automatability } from "../data/flows.js";
import type { AcceptedOverlay } from "../session/overlay-mirror.js";
import type { ProfileStore } from "../session/profile.js";
import { effectiveStatusPolicy } from "../data/status.js";

const AUTOMATABILITY = ["api", "web_only", "manual_review", "unknown"] as const;

export function registerFlowOperations(
  router: Router,
  data: DataSource,
  flows: FlowSource,
  // When an accepted overlay is wired (#47 piece D), accepted flows override the flows.json overlay
  // in the served result — the live registry (stateful) or the KV mirror (read-only, #87). Absent
  // it, serving is unchanged.
  registry?: AcceptedOverlay,
  // When a per-user store is wired (#36 add-directory-status), list_application_flows honors that
  // user's status policy (excluded statuses omitted unless include_inactive).
  store?: ProfileStore,
): void {
  router.register({
    name: "get_application_flow",
    semanticCategory: "READ",
    description:
      "Get the merged application flow for one program (curated overlay over a derived " +
      "baseline): what it takes to apply — automatability, required inputs, submission, " +
      "redemption, danger level, confidence, and the explicit `gaps` an agent must still resolve.",
    params: {
      slug: {
        type: "string",
        required: true,
        description:
          "The program slug, e.g. deepgram/deepgram-pricing-startup-credits.",
      },
    },
    returns:
      "An object with the `flow` record and a `freshness` annotation (verified, stale, age_days).",
    handler: async (params) => {
      await data.ensureLoaded();
      await flows.ensureLoaded();
      const slug = params.slug as string;
      const program = data.programs().find((p) => p.slug === slug);
      if (!program) {
        return err("NOT_FOUND_RESOURCE", `no program with slug: ${slug}`, { slug });
      }
      const accepted = registry ? await registry.accepted() : undefined;
      const flow = getApplicationFlow(program, flows, accepted);
      return ok({ flow, freshness: freshness(flow) });
    },
  });

  router.register({
    name: "list_application_flows",
    semanticCategory: "READ",
    description:
      "List application-flow summaries across the directory, optionally filtered by " +
      "automatability — so an agent can discover which perks are in-pipeline (`api`) vs a " +
      "handoff (`web_only` / `manual_review`).",
    params: {
      automatability: {
        type: "string",
        required: false,
        enum: AUTOMATABILITY,
        description: "Filter by automatability.",
      },
      include_inactive: {
        type: "boolean",
        required: false,
        description:
          "Include flows whose program status your policy excludes (e.g. Discontinued). Default false.",
      },
      limit: {
        type: "number",
        required: false,
        description: "Maximum number of results.",
      },
    },
    returns:
      "An object with `count` and `flows` (summary per program: slug, provider, title, " +
      "automatability, confidence, danger_level).",
    handler: async (params) => {
      await data.ensureLoaded();
      await flows.ensureLoaded();
      const automatability = params.automatability as Automatability | undefined;
      const limit = params.limit as number | undefined;

      const accepted = registry ? await registry.accepted() : undefined;
      let merged = data.programs().map((p) => getApplicationFlow(p, flows, accepted));
      if (automatability) {
        merged = merged.filter((f) => f.automatability === automatability);
      }
      if (params.include_inactive !== true && store) {
        const policy = effectiveStatusPolicy((await store.get())?.statusPolicy);
        merged = merged.filter((f) => policy[f.status].listing !== "exclude");
      }
      const summaries = merged.map((f) => ({
        slug: f.slug,
        provider: f.provider,
        title: f.title,
        status: f.status,
        automatability: f.automatability,
        confidence: f.confidence,
        danger_level: f.danger_level,
      }));
      const limited = limit !== undefined ? summaries.slice(0, limit) : summaries;
      return ok({ count: limited.length, flows: limited });
    },
  });
}
