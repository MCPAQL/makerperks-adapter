# Design — Flow freshness + per-user health (#47 piece B)

Two signals tell the runtime whether to trust a cached flow: **freshness** (derived, free) and
**health** (per-user, reuses the DO). Together they yield a use / reverify / rediscover
recommendation — the input to piece C's cache→discover loop.

## Decisions

### 1. Freshness is derived from the document — no storage

A curated flow carries a `verified` date. Staleness is computed at read time:
`stale = verified !== undefined && (now − Date(verified)) > TTL`, default **TTL = 90 days**
(a single constant; per-flow / danger-weighted TTLs are a later refinement). A derived baseline
has no `verified` and is therefore not "stale" — it is simply unverified, which `gaps` already
says. `get_application_flow` returns a `freshness` annotation `{ verified, stale, age_days }`
alongside the flow, so even the live read-only endpoint surfaces staleness with zero new state.

### 2. Health is per-user and lives in the existing DO record

"Did my attempts on this flow work?" is per-user state, so it goes in the `UserRecord` we already
persist (per-user Durable Object; in-memory locally) — no new storage engine:

```ts
interface FlowHealth {
  last_success_at?: number;
  last_failure_at?: number;
  failure_count: number; // CONSECUTIVE failures; reset to 0 on a success
  last_note?: string;
}
interface UserRecord { /* …profile, vault, audit… */ flowHealth?: Record<string, FlowHealth>; }
```

`report_flow_outcome(slug, "success" | "failure", note?)`:
- **success** → `last_success_at = now`, `failure_count = 0` (a win clears the streak)
- **failure** → `last_failure_at = now`, `failure_count += 1`
- stores `last_note`; appends an audit entry (`report_flow_outcome`)

`failure_count >= 2` (a small constant `REDISCOVER_AFTER`) marks the flow **flagged for
re-discovery**. Consecutive (not lifetime) failures, so a flow that works again is trusted again.

### 3. `get_flow_status(slug)` is the diagnostic

A READ op returning everything a maker (or agent) needs to decide:

```jsonc
{
  "slug": "gcp/google-ai-startup-program",
  "freshness": { "verified": "2026-06-27", "stale": false, "age_days": 1 },
  "health": { "last_success_at": null, "last_failure_at": 1719_…, "failure_count": 2,
              "flagged_for_rediscovery": true },
  "recommendation": "rediscover"
}
```

Recommendation precedence: **rediscover** (flagged by failures) → **reverify** (stale) →
**use**. `flagged_for_rediscovery` is the signal piece C consumes. `health` is present only when
a per-user store is wired; freshness is always present.

### 4. Where the ops register

`report_flow_outcome` (EXECUTE — it records per-user state, like `record_execution_step`) and
`get_flow_status` (READ) both need the `FlowSource` (freshness) **and** the `ProfileStore`
(health), so they register together only when a profile store is present — the local personal
tool and the authed dev endpoint. The live read-only endpoint gets freshness via the
`get_application_flow` annotation but not the per-user health ops. `get_application_flow` itself
stays a pure READ over `data` + `flows` (the annotation needs no store).

## Out of scope (tracked)

Global/aggregated health across users (a later shared store — D1 or a flow-registry DO);
auto-triggering re-discovery (piece C); configurable / danger-weighted TTLs.
