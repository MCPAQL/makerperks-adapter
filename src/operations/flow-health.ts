// Flow health + freshness ops (#47 piece B): the runtime's signal for whether to trust a cached
// flow. `report_flow_outcome` records this USER's success/failure on a flow (per-user health in
// the existing UserRecord); `get_flow_status` combines derived freshness + that health into a
// use / reverify / rediscover recommendation (the `rediscover` signal feeds piece C). Registered
// only when a per-user ProfileStore is wired (local + the authed dev endpoint); the live
// read-only endpoint gets freshness via the get_application_flow annotation instead.
// See openspec/changes/add-flow-health (capability `flow-health`).

import { ok, err } from "../core/wire.js";
import type { Router } from "../core/router.js";
import type { DataSource } from "../data/source.js";
import type { FlowSource } from "../data/flow-source.js";
import { getApplicationFlow, freshness } from "../data/flows.js";
import { appendAudit, type FlowHealth, type ProfileStore } from "../session/profile.js";

// Consecutive failures at/above which a flow is flagged for re-discovery (piece C consumes this).
const REDISCOVER_AFTER = 2;

const OUTCOMES = ["success", "failure"] as const;

export function registerFlowHealthOperations(
  router: Router,
  data: DataSource,
  flows: FlowSource,
  store: ProfileStore,
): void {
  router.register({
    name: "report_flow_outcome",
    semanticCategory: "EXECUTE",
    description:
      "Record the outcome of an attempt to apply via a perk's flow (success | failure). A " +
      "success clears this user's consecutive-failure streak; repeated failures flag the flow " +
      "for re-discovery. Per-user and audited — feeds get_flow_status.",
    params: {
      slug: {
        type: "string",
        required: true,
        description: "The program slug the attempt was for.",
      },
      outcome: {
        type: "string",
        required: true,
        enum: OUTCOMES,
        description: "success | failure.",
      },
      note: {
        type: "string",
        required: false,
        description: "A short non-secret note about the attempt.",
      },
    },
    returns: "An object with the updated `health` and `flagged_for_rediscovery`.",
    handler: async (params) => {
      await data.ensureLoaded();
      const slug = params.slug as string;
      const outcome = params.outcome as (typeof OUTCOMES)[number];
      const note = params.note as string | undefined;
      if (!data.programs().some((p) => p.slug === slug)) {
        return err("NOT_FOUND_RESOURCE", `no program with slug: ${slug}`, { slug });
      }

      const record = (await store.get()) ?? {};
      const current: FlowHealth = record.flowHealth?.[slug] ?? { failure_count: 0 };
      const now = Date.now();
      const updated: FlowHealth =
        outcome === "success"
          ? { ...current, last_success_at: now, failure_count: 0 }
          : {
              ...current,
              last_failure_at: now,
              failure_count: current.failure_count + 1,
            };
      if (note !== undefined) updated.last_note = note;

      await store.set(
        appendAudit(
          { ...record, flowHealth: { ...record.flowHealth, [slug]: updated } },
          "report_flow_outcome",
          `${slug}:${outcome}`,
        ),
      );
      return ok({
        slug,
        health: updated,
        flagged_for_rediscovery: updated.failure_count >= REDISCOVER_AFTER,
      });
    },
  });

  router.register({
    name: "get_flow_status",
    semanticCategory: "READ",
    description:
      "Diagnose a perk's flow: its freshness (stale past the verified TTL), this user's health " +
      "(success/failure history), and a recommendation — `rediscover` (failing), `reverify` " +
      "(stale), or `use`.",
    params: {
      slug: {
        type: "string",
        required: true,
        description: "The program slug to diagnose.",
      },
    },
    returns:
      "An object with `freshness`, `health` (incl. `flagged_for_rediscovery`), and a `recommendation`.",
    handler: async (params) => {
      await data.ensureLoaded();
      await flows.ensureLoaded();
      const slug = params.slug as string;
      const program = data.programs().find((p) => p.slug === slug);
      if (!program) {
        return err("NOT_FOUND_RESOURCE", `no program with slug: ${slug}`, { slug });
      }
      const fresh = freshness(getApplicationFlow(program, flows));
      const health: FlowHealth = (await store.get())?.flowHealth?.[slug] ?? {
        failure_count: 0,
      };
      const flagged = health.failure_count >= REDISCOVER_AFTER;
      const recommendation = flagged ? "rediscover" : fresh.stale ? "reverify" : "use";
      return ok({
        slug,
        freshness: fresh,
        health: { ...health, flagged_for_rediscovery: flagged },
        recommendation,
      });
    },
  });
}
