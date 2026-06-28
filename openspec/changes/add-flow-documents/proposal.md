## Why

Piece A of the #47 arc (generalized flow discovery). Today the curated application-flow overlay
is a **bundled TypeScript constant** (`src/data/provider-flows.ts`, 3 hand-researched spikes).
That can't scale to a discovered, evolving directory, can't be shared, and needs a redeploy to
change. This change makes the overlay a **portable per-perk Flow Document** consumed as a loaded
data source: a published **`flows.json`** the hosted server **fetches like `perks.json`** (no
redeploy to update), read locally for the personal-tool mode, and ingestable elsewhere. It is
the foundation the rest of #47 sits on — freshness/health + `report_flow_outcome` (piece B), the
discovery harness (piece C), and acceptance/queue (piece D). No flow *content* changes here; the
3 spikes migrate verbatim.

## What Changes

- **Flow Document** — a per-perk JSON artifact: the curated flow (automatability, submission,
  required_inputs, redemption, danger_level, gaps) plus explicit provenance (`source` /
  `sources[]`, `verified`). The collection is published as **`flows.json`** (a map of slug →
  document). Health/freshness fields are reserved for piece B; the document stays
  forward-compatible.
- **`FlowSource` loader** (mirrors `DataSource`): load + **eval-free validate**
  (`collectCuratedFlowErrors`, already built for exactly this) + TTL refresh; fetch from
  `FLOWS_URL` on the hosted worker (with a bundled `flows.json` as the out-of-the-box default —
  "if we don't have one, we ship one"), or read a file/URL locally.
- **`getApplicationFlow` consumes the loaded overlay** instead of the bundled constant — same
  `mergeFlow()` (curated overlay over derived baseline), threaded through the flow ops, the
  pipeline, and the handoff. The 3 curated spikes move from `provider-flows.ts` into `flows.json`.

## Capabilities

### New Capabilities

- `flow-documents`: a portable, eval-free-validated per-perk Flow Document overlay loaded from a
  `flows.json` (fetched on the hosted worker, read locally), replacing the bundled overlay
  constant and enabling external publication (e.g. an MIT-safe guide for MakerPerks).

## Impact

- **Affected specs:** `flow-documents` (new); `application-flows` (MODIFIED — the curated overlay
  is a loaded, portable data source, not a bundled module).
- **Affected code:** new `src/data/flow-source.ts` (`FlowSource`); `getApplicationFlow` takes the
  loaded overlay; `provider-flows.ts` → `flows.json` (+ a bundled default for the worker);
  `operations/flows.ts` / `operations/execute.ts` / `operations/handoff.ts` preload the
  `FlowSource` alongside the `DataSource`; `worker-stateful.ts` + `worker.ts` + `index.ts` wire
  `FLOWS_URL`. The flow schema, `deriveFlow`, `mergeFlow`, and the eval-free validator are reused
  unchanged.
- **License boundary:** the structured Flow Documents are this repo's IP (AGPL-3.0 + commercial);
  only **MIT-safe `steps_to_apply` prose** may flow back to `natea/makerperks` — a derived
  guide extract is a later concern (not in this change), not the raw `flows.json`.
- **Non-goals / tracked follow-up:** freshness/health + `report_flow_outcome` (piece B, #47); the
  discovery harness (piece C); acceptance autonomy + proposed-flow queue (piece D, with #35);
  publishing `flows.json` to a real CDN/URL and the Nate-facing MIT guide extract.
