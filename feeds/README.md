# Feeds

Datasets this adapter federates that are OURS to host (the perks.json primary stays
MakerPerks' published artifact — never copied here).

- `accelerators.json` — perks.json-family directory of accelerators/incubators/founder
  programs (46 entries, live-web verified 2026-07-29). Moved here 2026-07-31 from the
  `mickdarling/makerperks` fork so the deployed workers depend only on repos we own.
  Served raw to the workers via `PERKS_URLS` (prefix `accel`). Contains **no fit
  fields** — fit judgments are personal data, held per-user in the profile store
  (openspec: `per-user-fit-annotations`); ingest strips them from any feed regardless.

Regeneration: source of truth is the maintainer's program directory (Dollhouse
`accelerator-directory` memory); emit with the fit fields already stripped.
