# Tasks — serve the accelerators feed

> Backend/data/agent work — impeccable does not apply.
>
> **Decisions (from design):** one generalized checker (no per-feed schema
> discriminator) · `audience` normalized to `[]` at ingest · `value_type`/`status`
> open strings (status-policy matrix extension is a follow-up) · rolling = explicit
> `next_deadline: null`, absent field = not deadline-family · dev worker only.

## 1. Data source

- [x] 1.1 Widen `PerkProgram`: `audience` optional in the payload (required
  post-ingest), `value_type`/`status` as `string`, typed optional accelerator fields
- [x] 1.2 Generalize `collectPayloadErrors` per the delta spec (core strict, variants
  open, family fields type-checked when present)
- [x] 1.3 Normalize `audience: []` in `load()`

## 2. Query

- [x] 2.1 Register `upcoming_deadlines` (within_days? default 60 cap 730, feed?,
  include_rolling? default true, limit?) — dated soonest-first with `days_left`,
  explicit-null rolling appended, past excluded
- [x] 2.2 Widen `list_programs` `status` enum with Defunct/Paused/Unverified

## 3. Deployment config

- [x] 3.1 `wrangler.dev.jsonc`: `PERKS_URLS` federating perks.json + the accelerators
  raw-GitHub URL (id `accelerators`, prefix `accel`)

## 4. Tests & gates

- [x] 4.1 Fixture `test/fixtures/accelerators.sample.json` (dated + rolling + Defunct
  + core-violation cases used across tests)
- [x] 4.2 `test/accelerators-feed.test.mjs`: checker accepts the family; core still
  enforced; audience normalized; federation with prefix; `upcoming_deadlines`
  windowing/ordering/rolling/perks-exclusion; status filter passthrough
- [x] 4.3 `npm test` green (unit + workers) · `npm run lint` green
- [x] 4.4 `npm run spec:validate serve-accelerators-feed -- --strict` passes
