// Flow-export toolkit (#84 / #85) — the read-out half of the flows.json round-trip. `export_flows`
// emits the EFFECTIVE curated overlay (the loaded flows.json merged with the registry's accepted
// overlay, accepted winning) as a portable flows.json document, plus a per-slug source breakdown so
// the export is auditable. Read-only and dependent only on `flows` (+ an optional registry), so it
// is available on every deployment — on the read-only endpoint (no registry) it exports just the
// loaded overlay, every slug sourced "base". It does NOT reconcile accepted back into the file
// (that durable-source-of-truth decision is #87).
// See openspec/changes/add-flow-export (capability `flow-export`).

import { ok } from "../core/wire.js";
import type { Router } from "../core/router.js";
import type { FlowSource } from "../data/flow-source.js";
import type { CuratedFlows } from "../data/flows.js";
import type { AcceptedOverlay } from "../session/overlay-mirror.js";

export function registerFlowExportOperations(
  router: Router,
  flows: FlowSource,
  // Optional accepted overlay (#47 piece D / #64): the live registry on the stateful side, or a
  // KV-mirror-backed overlay on the read-only side (#87). When wired, the accepted overlay is merged
  // in (accepted wins) and those slugs are sourced "accepted". Without it, export is the loaded overlay.
  registry?: AcceptedOverlay,
): void {
  router.register({
    name: "export_flows",
    semanticCategory: "READ",
    description:
      "Export the effective curated overlay as a portable flows.json document: the loaded overlay " +
      "(flows.json) merged with the registry's accepted overlay, accepted entries winning — the " +
      "same precedence the server serves. Returns `count`, `flows` (the merged slug -> Flow " +
      "Document map, re-ingestible as a flows.json), and `sources` (a per-slug base/accepted " +
      "breakdown for transparency). On the read-only endpoint (no registry) it exports just the " +
      "loaded overlay, every slug sourced `base`.",
    params: {},
    returns:
      "An object with `count`, `flows` (the effective overlay map), and `sources` " +
      "(slug -> `base` | `accepted`).",
    handler: async () => {
      await flows.ensureLoaded();
      const base = flows.all();
      const accepted = registry ? await registry.accepted() : {};
      const merged: CuratedFlows = { ...base, ...accepted };
      const sources: Record<string, "base" | "accepted"> = {};
      for (const slug of Object.keys(merged)) {
        sources[slug] = slug in accepted ? "accepted" : "base";
      }
      return ok({ count: Object.keys(merged).length, flows: merged, sources });
    },
  });
}
