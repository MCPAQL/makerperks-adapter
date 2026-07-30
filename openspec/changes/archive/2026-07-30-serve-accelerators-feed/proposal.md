## Why

The federation layer (#88) was built so the adapter could serve any perks.json-family
opportunity feed — "perks / grants / college programs / …". The first real second feed
now exists: `accelerators.json` (mickdarling/makerperks `datasets/accelerators/`), a
46-program directory of accelerators/incubators/founder programs sharing the perks.json
core fields. But it cannot federate today: the payload checker hard-requires `audience`
(accelerators have none) and pins perks-only vocabularies for `value_type`
(credits/discount/free_tier vs the feed's investment/grant/services) and `status`
(no Defunct/Paused/Unverified). And the family's signature query — *what deadlines are
coming up?* — has no operation.

## What Changes

- **The payload checker accepts the perks.json family, not just perks.json**:
  `audience` becomes optional (normalized to `[]` on ingest), `value_type` and `status`
  validate as open strings, and the accelerator-specific fields (`apply_url`,
  `category`, `format`, `next_deadline`, `deadline_note`, …) are typed and
  type-checked when present. The required core is unchanged: slug, title, provider,
  url, max_value, sources, verified.
- **A new READ operation `upcoming_deadlines`**: programs with a dated
  `next_deadline` inside a day window, soonest-first with `days_left`, plus programs
  that explicitly declare `next_deadline: null` (rolling — deliberate, distinct from
  feeds whose schema lacks the field, so perks programs never appear).
- **`list_programs`' `status` filter enum widens** to include the accelerator
  vocabulary (Defunct/Paused/Unverified).
- **The dev deployment federates the accelerators feed** (`PERKS_URLS` in
  `wrangler.dev.jsonc`, prefix `accel`, default untrusted-secondary trust). The live
  worker config is untouched.

## Capabilities

### New Capabilities

(none.)

### Modified Capabilities

- `data-source`: payload validation generalizes to perks.json-family feeds.
- `directory-query`: adds the deadline-window query.

## Impact

- **Affected specs:** `data-source` (added requirement), `directory-query` (added
  requirement).
- **Code:** `src/data/source.ts` (types + checker + audience normalization),
  `src/operations/read.ts` (`upcoming_deadlines`, status enum), `wrangler.dev.jsonc`.
- **Behavior guards:** unknown `status` values already resolve to the fail-open
  default (`Active`) in the status-policy layer — extending the *policy* vocabulary
  is a noted follow-up, not in scope. Untrusted-feed programs already never take the
  credential auto-expose path (#97) — the accelerators feed rides that default.
- **Non-goals:** accelerator-specific flows; feed-specific search weighting;
  extending the status-policy matrix.
