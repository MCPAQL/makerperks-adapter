# Design — serve the accelerators feed

## Decisions

- **Generalize the checker, don't fork it.** One `collectPayloadErrors` for the whole
  perks.json family: the shared required core stays strict; family-variant fields
  (`audience`, `value_type`, `status`) go optional/open; accelerator additions are
  optional and type-checked when present. A per-feed `schema:` discriminator was
  rejected — it doubles the validation surface for no gain, and the federation spec's
  premise is one family, one checker.
- **`audience` normalizes to `[]` at ingest** (in `load()`), so `PerkProgram.audience`
  stays a required `string[]` for every consumer — no downstream null-guards, and the
  `audience` filter simply never matches accelerator programs.
- **`value_type`/`status` widen to `string` in the type.** `resolveStatus` already
  fail-opens unknown statuses to `Active`, so Defunct/Paused/Unverified accelerators
  list by default — same visibility posture as the rest of the directory. Follow-up
  (out of scope): extend the status-policy matrix so users can exclude Defunct.
- **Rolling ≠ missing.** `upcoming_deadlines` treats an *explicit* `next_deadline:
  null` as "rolling — apply anytime" (every accelerators.json record carries the
  field) and an *absent* field as "not a deadline-family program" (every perks.json
  record). This is why perks programs can never leak into the rolling list.
- **`days_left` is computed against the current UTC date** at query time; past
  deadlines are excluded. Window default 60 days, cap 730.
- **A radar never books the dead.** `upcoming_deadlines` drops `Defunct`/`Paused`
  programs from both lists (they are landscape memory, not appliable deadlines);
  `Unverified` stays and each entry carries `status` so an agent sees the caveat.
- **Dev-only rollout.** `PERKS_URLS` lands in `wrangler.dev.jsonc` only; the live
  worker keeps its single-feed default until the dev deployment proves out. The feed
  gets `prefix: "accel"` (slug isolation) and the positional untrusted default —
  browsing needs no trust, and the credential auto-expose gate stays closed.

## Data source URL

Raw GitHub `main` copy
(`https://raw.githubusercontent.com/mickdarling/makerperks/main/datasets/accelerators/accelerators.json`)
until the MakerPerks site build publishes `/accelerators.json`.
