## Why

The accelerators dataset shipped with `fit`/`fit_note` — the maintainer's own
program-fit judgments — baked into the public feed. That's personal data
(founder-profile fingerprint: geography, stage, strategy) in a public artifact,
and it's the wrong layer entirely: fit is a property of a *user's* relationship to
a program, not of the program. The published dataset has now been stripped
(mickdarling/makerperks PR #2). The adapter needs the right home for that data:
per-user, stored in the profile Durable Object, asked for through the MCP surface,
never hard-coded.

## What Changes

- **Per-user fit annotations in the profile store**: `UserRecord.fitAnnotations`
  maps program slug → `{ fit: high|medium|low, note? }`, exactly parallel to the
  per-user `statusPolicy`.
- **Three operations, registered only where a profile store is wired**:
  `set_program_fit` (UPDATE, validates the slug exists in the directory),
  `clear_program_fit` (DELETE), `get_fit_annotations` (READ).
- **Reads overlay the session user's fit**: `list_programs`, `get_program`,
  `search_programs`, and `upcoming_deadlines` decorate results with that user's
  `fit`/`fit_note` where annotated. Anonymous/read-only deployments serve no fit at
  all.
- **Feed-supplied fit is stripped at ingest**: any `fit`/`fit_note` arriving in a
  feed payload is dropped during federation, so fit can never be hard-coded into
  the served directory again — whatever a publisher ships.

## Capabilities

### New Capabilities

(none.)

### Modified Capabilities

- `maker-profile`: gains per-user program-fit annotations.
- `directory-query`: reads overlay the session user's fit annotations.
- `data-source`: feed-supplied fit fields are dropped at ingest.

## Impact

- **Affected specs:** `maker-profile`, `directory-query`, `data-source` (one added
  requirement each).
- **Code:** `src/session/profile.ts` (types), `src/operations/fit.ts` (new),
  `src/app.ts` (registration), `src/data/source.ts` (ingest strip),
  `src/operations/read.ts` (overlay).
- **Privacy:** fit data lives only in the per-user DO (structurally isolated) and
  in the operator's private records; the public dataset and the served shared
  directory carry none.
- **Non-goals:** bulk import tooling (the annotations file is small enough to load
  via repeated `set_program_fit`); sharing/aggregating fit across users; fit-based
  ranking.
