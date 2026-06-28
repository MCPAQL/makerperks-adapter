# Design — Flow Documents + flows.json (#47 piece A)

Turn the curated flow overlay from a bundled TS constant into a portable, loaded data source.
This is a refactor of *where the overlay comes from* — the schema, `deriveFlow`, `mergeFlow`,
and the eval-free validator are all reused. No flow content changes; the 3 spikes migrate.

## Decisions

### 1. The Flow Document is the per-perk unit; `flows.json` is the published collection

A **Flow Document** is one perk's curated flow + provenance, keyed by slug. It is exactly
today's `CuratedFlow` (a partial flow whose present fields override the derived baseline) with
provenance made explicit:

```jsonc
// flows.json — a map of slug → Flow Document
{
  "gcp/google-ai-startup-program": {
    "automatability": "web_only",
    "submission": { "method": "web_form", "action_url": "…", "instructions": "…" },
    "required_inputs": [ /* … */ ],
    "redemption": { "type": "manual_review", "note": "…" },
    "danger_level": 2,
    "gaps": [ "…" ],
    "source": "https://cloud.google.com/startup/apply",
    "sources": [ "https://cloud.google.com/startup/apply" ],  // per-claim provenance (additive)
    "verified": "2026-06-27"
  }
}
```

Each entry is a self-contained per-perk document, so the collection *is* per-perk granularity in
one fetchable file. `sources[]` is additive (multi-claim provenance); the existing `source` /
`verified` are kept. **Health/freshness fields are NOT added here** — piece B owns them; the
document is forward-compatible (unknown fields are tolerated by the eval-free validator).

### 2. `FlowSource` — a loaded overlay mirroring `DataSource`

A `FlowSource` parallels `DataSource`: a configurable source (URL or file path), a `fetchImpl`
override for tests, **eval-free validation via `collectCuratedFlowErrors`** (which was written
"to also guard any future external/fetched overlay" — this is that future), and a TTL refresh.
After `ensureLoaded()` it exposes a **sync** `curatedFor(slug)` so `getApplicationFlow` stays
synchronous; callers `await flows.ensureLoaded()` at handler entry exactly as they already
`await data.ensureLoaded()`.

### 3. Consumption: fetch on the worker, file locally, bundled default either way

The hosted worker **fetches `FLOWS_URL`** (like `PERKS_URL`) so flows update with **no redeploy**.
Because Workers have no filesystem and a URL may not be configured yet, the build also produces a
**bundled `flows.json`** the `FlowSource` falls back to — so the server always has an overlay
out of the box ("if we don't have one, we ship one"), and `FLOWS_URL` is a pure override. Local
mode reads a file/URL (default: the bundled copy); a future local mode may split documents into
individual files under `~/.makerperks/flows/`.

### 4. `getApplicationFlow` takes the loaded overlay (no other behaviour change)

`getApplicationFlow(program, flows)` calls `mergeFlow(deriveFlow(program), flows.curatedFor(slug))`
— identical merge semantics, the overlay just comes from the `FlowSource` instead of the bundled
constant. It is threaded through the flow ops, the pipeline (`execute.ts`), and the handoff
(`handoff.ts`) the same way `data` already is. `provider-flows.ts` is removed; its 3 records
become `flows.json` entries (the bundled default is generated from / equal to `flows.json`).

### 5. License boundary stays intact

The structured Flow Documents are this repo's IP (AGPL-3.0 + commercial). Publishing `flows.json`
for our own hosted/local consumption is fine; an **MIT-safe guide extract** for `natea/makerperks`
(the human-readable `steps_to_apply` prose only) is a *separate, later* artifact — this change
does not push the raw structured records into Nate's MIT repo.

### 6. Storage backing: a blob now; the `FlowSource` seam keeps it swappable

`FlowSource` is deliberately an abstraction over *where the overlay lives*, so the storage engine
is not baked into any consumer. For piece A the backing is a **blob** (`flows.json`, loaded once
per isolate) — the right call for a **read-mostly, list-heavy** overlay, especially post the
2026-06-28 KV-overuse incident:

- **`list_application_flows` needs all flows at once.** KV is get-by-key + list-keys only (no
  query); listing from KV means a maintained index + N reads — most of the blob's work anyway.
  In-memory blob filtering is trivial.
- **Per-request KV reads are the exact pattern that bit us** (the reconnect-loop read flood). A
  KV-per-slug overlay would put flow lookups back on that hot path unless cached in-isolate — at
  which point it has re-derived the blob's in-memory model, piecemeal and eventually-consistent.
- The blob mirrors the proven `perks.json` (`DataSource`) pattern: zero per-request external
  reads after the first load.

Granular per-key storage earns its keep only once we **write** individual documents — pieces
B/C/D (health updates, discovered flows, acceptance). And there the better engine is likely **D1
or a Durable-Object-backed registry, not KV**: piece B must *query* "which flows are stale /
failing", which KV cannot do, while D1 (SQL) and DO storage (strongly consistent, transactional —
unlike KV's eventual consistency) can. That decision is deferred to **piece B**, made against B's
real query patterns; because consumers only touch `FlowSource`, swapping the backing then changes
nothing above it.

## Out of scope (tracked — the rest of #47)

Freshness/health + `report_flow_outcome` (piece B); the research→generate→verify discovery
harness (piece C); acceptance autonomy + the proposed-flow review queue (piece D, shares #35);
publishing `flows.json` to a real CDN and the Nate-facing MIT guide extract.
