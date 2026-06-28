## Why

Piece B of the #47 arc. Piece A made flows portable; now we make them **self-aware about
staleness and failure** so the runtime knows when to trust a cached flow vs. re-verify or
re-discover it (the cache→discover→verify loop's signal). Two complementary signals:
**freshness** (has the curated flow aged past a TTL?) and **health** (are an agent's actual
attempts on this flow succeeding or failing?). This is the diagnostic a local/personal user
needs ("no flow yet / your flow is stale / it keeps failing"), and it produces the
`rediscover` signal piece C acts on. Per the design decision, health is **per-user** (reusing
the existing per-user Durable Object record); global aggregation is a later layer.

## What Changes

- **Freshness (derived, no storage):** a flow is `stale` when its curated `verified` date is
  older than a TTL (default 90 days). `get_application_flow` gains a `freshness` annotation
  (`stale`, `verified`, `age_days`) — available everywhere, including the live read-only
  endpoint. A derived baseline (no `verified`) is not "stale", just unverified (already in
  `gaps`).
- **Health (per-user):** `UserRecord` gains `flowHealth[slug]` (`last_success_at`,
  `last_failure_at`, `failure_count`, `last_note`) in the per-user DO we already have. A new
  **`report_flow_outcome(slug, outcome, note?)`** EXECUTE op records an attempt — success clears
  the consecutive-failure streak; `failure_count >= 2` flags the flow for re-discovery. Each
  report is audited.
- **Diagnostic:** a new **`get_flow_status(slug)`** READ op returns the freshness + per-user
  health + a `recommendation` (`use` / `reverify` / `rediscover`). Registered where the
  per-user store is wired (local + the authed dev endpoint); freshness alone is still on every
  `get_application_flow`.

## Capabilities

### New Capabilities

- `flow-health`: per-perk freshness (TTL staleness) + per-user health (success/failure tracking
  via `report_flow_outcome`) surfaced as a `get_flow_status` diagnostic with a use/reverify/
  rediscover recommendation.

## Impact

- **Affected specs:** `flow-health` (new); `application-flows` (MODIFIED — `get_application_flow`
  carries a freshness annotation).
- **Affected code:** a `freshness` helper (TTL/stale from `verified`); `UserRecord.flowHealth`
  (`session/profile.ts`); new `report_flow_outcome` + `get_flow_status` ops bound to the
  `FlowSource` + the per-user `ProfileStore`; `operations/flows.ts` adds the freshness annotation;
  `buildRouter` registers the flow-health ops when a profile store is present. The curated
  `flows.json`, the pipeline, and the vault are unchanged.
- **Non-goals / tracked follow-up:** global/aggregated flow health across users (a later shared
  store); auto-triggering re-discovery (piece C consumes the `rediscover` signal); a configurable
  per-flow or danger-weighted TTL (a single default TTL here).
