// Flow-reconcile (#87) — the operator-gated publish step. `reconcile_flows` flushes the registry's
// accepted overlay into the shared overlay mirror, so the read-only public endpoint serves
// operator-blessed flows with no redeploy. The Durable Object stays the always-live layer on the
// stateful side; this is the DELIBERATE publish (not an automatic side effect of accept). Gated by
// operator authority (#90). Registered only where both a registry (to read) and a mirror (to write)
// are wired — the stateful endpoint. See openspec/changes/add-flow-reconcile (capability `flow-reconcile`).

import { ok, err } from "../core/wire.js";
import type { Router } from "../core/router.js";
import type { FlowRegistry } from "../session/flow-registry.js";
import type { OverlayMirror } from "../session/overlay-mirror.js";

export function registerFlowReconcileOperations(
  router: Router,
  registry: FlowRegistry,
  mirror: OverlayMirror,
  // Operator authority (#90). A non-operator gets FORBIDDEN; the mirror is untouched. Resolved by
  // the server from the session identity — never a caller param. Defaults to false (fail safe).
  operator = false,
): void {
  router.register({
    name: "reconcile_flows",
    semanticCategory: "UPDATE",
    description:
      "Publish the accepted overlay to the shared mirror so the read-only public endpoint serves " +
      "the operator-blessed flows with no redeploy. Operator-only (the live Durable Object stays " +
      "the always-current layer on this endpoint; this is the deliberate publish, not an automatic " +
      "effect of accepting). Returns the published `count` and `slugs`.",
    params: {},
    returns: "An object with `count` and `slugs` (the published accepted overlay).",
    handler: async () => {
      if (!operator) {
        return err(
          "FORBIDDEN",
          "reconcile_flows requires operator authority — it publishes the accepted overlay to the public mirror",
        );
      }
      const overlay = await registry.accepted();
      await mirror.write(overlay);
      const slugs = Object.keys(overlay);
      return ok({ count: slugs.length, slugs });
    },
  });
}
