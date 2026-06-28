# Tasks — Flow freshness + per-user health (#47 piece B)

> **Scope:** derived freshness (TTL staleness from `verified`) surfaced on `get_application_flow`;
> per-user health in the existing `UserRecord` via `report_flow_outcome`; a `get_flow_status`
> diagnostic with a use/reverify/rediscover recommendation. Global/aggregated health,
> auto-triggering re-discovery (piece C), and configurable TTLs are **out of scope**.
>
> **Definition of done:** all tasks `[x]`, `openspec validate add-flow-health --strict` passes,
> typecheck/lint/both test layers green, freshness shows on `get_application_flow` everywhere,
> `report_flow_outcome` updates per-user health (audited), `get_flow_status` recommends correctly,
> and the live endpoints stay correct. One commit per section, closing its issue.

## 1. Freshness (derived) + the get_application_flow annotation — #60

- [x] 1.1 `freshness(flow, now?)` in `data/flows.ts`: `stale = verified && now − verified > TTL`
  (TTL = 90 days constant); returns `{ verified, stale, age_days }`; a flow without `verified`
  is not stale (age_days null)
- [x] 1.2 `get_application_flow` returns a `freshness` annotation alongside `flow` (no store —
  on the live read-only endpoint too)
- [x] 1.3 Tests: freshness unit (recent fresh / old stale / none not-stale) + an op test that
  `get_application_flow` carries the annotation. 127 node:test green

## 2. Per-user health: report_flow_outcome + get_flow_status — #61

- [ ] 2.1 `UserRecord.flowHealth[slug]` (`FlowHealth`: last_success_at / last_failure_at /
  failure_count / last_note) in `session/profile.ts`
- [ ] 2.2 `report_flow_outcome(slug, outcome, note?)` EXECUTE op: success clears the streak,
  failure increments it; `failure_count >= REDISCOVER_AFTER` (2) flags it; appends an audit
  entry. Needs the per-user store
- [ ] 2.3 `get_flow_status(slug)` READ op: freshness + per-user health + `recommendation`
  (rediscover → reverify → use). Registered with the per-user store (alongside #2.2)
- [ ] 2.4 Tests: a failure then a success resets the streak; two failures flag rediscover; a
  stale-but-healthy flow recommends reverify; a fresh healthy flow recommends use; outcomes are
  audited; the ops are gated on the profile store

## 3. Validate + archive — #62

- [ ] 3.1 `openspec validate add-flow-health --strict`; typecheck/lint/both test layers green
- [ ] 3.2 Archive into `openspec/specs/` (`flow-health` created; the `application-flows` delta
  applied)
