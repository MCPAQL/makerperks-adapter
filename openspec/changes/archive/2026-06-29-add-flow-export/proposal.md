## Why

First piece of epic #84 (portable directory data). Today the curated overlay has a **read-in**
path but no **read-out** path: `FlowSource` ingests a `flows.json` (bundled / `FLOWS_URL` / local
file), and `accept_flow` publishes accepted proposals into the registry Durable Object's **accepted
overlay**, served live as the highest-precedence layer — but that accepted layer is **never written
back to the file**. So the committed `flows.json` is *not* the current effective overlay, and there
is no way for another app/process to pull what the server is actually serving.

`export_flows` closes the read-out half of the round-trip: a READ op that emits the **effective
curated overlay** — the loaded `flows.json` merged with the registry's accepted overlay (accepted
wins) — as a valid `flows.json` document, plus a per-slug **source breakdown** (which slugs came
from the base file vs. the accepted overlay) so the export is auditable. With the write-half
already existing (`FLOWS_URL` / local path), this makes the overlay externally co-maintainable:
export → edit → re-publish → the server ingests it. It does **not** reconcile the accepted overlay
back into the file (that durable-source-of-truth decision is the separate #87).

## What Changes

- **`export_flows()` (READ):** returns `{ count, flows, sources }` where `flows` is the effective
  overlay map (`{ ...flowSource.all(), ...(registry?.accepted() ?? {}) }`, accepted entries
  winning) — a valid `CuratedFlows` document — and `sources` is a per-slug `"base" | "accepted"`
  breakdown for transparency. With no registry wired (the read-only endpoint) it exports just the
  loaded overlay, every slug `"base"`. Pure, no params, available on every deployment.
- **`scripts/export-flows.mjs` (dev tooling, never bundled):** calls the data layer (the same merge
  as the op) and writes a `flows.json` file, so an external process can pull the effective overlay.
- **Round-trip documentation:** document the export → external edit → host at `FLOWS_URL` (or commit
  the file) → `FlowSource` ingests loop, noting that the runtime accepted overlay still layers on
  top until reconciled (#87).

## Capabilities

### New Capabilities

- `flow-export`: emit the effective curated overlay (`flows.json` base ⊕ registry accepted overlay)
  as a portable, auditable `flows.json` document — the read-out half of the round-trip — plus the
  dev export script and the documented co-maintenance loop.

## Impact

- **Affected specs:** `flow-export` (new). No existing spec is modified — export is a new read-only
  capability that *consumes* `FlowSource.all()` (flow-documents) and `registry.accepted()`
  (flow-acceptance / #64) without changing either.
- **Affected code:** a new `operations/flow-export.ts` registering one READ op on `flows` + an
  optional `FlowRegistry`; `buildRouter` registration (unconditional, like the discovery toolkit);
  a new `scripts/export-flows.mjs`; a round-trip note in the docs. The worker bundle, the pipeline,
  the vault, `perks.json`, and `flows.json` itself are unchanged.
- **Non-goals / tracked follow-up:** reconciling the accepted overlay back into the durable
  `flows.json` artifact (writable overlay store vs. PR/commit) — **#87**; multi-source `perks.json`
  ingestion (**#88**) and MCP-generated `perks.json` (**#89**); the MIT-safe `steps_to_apply`
  extract for Nate (folded into #87 / the contribution-mediator epic #80).
