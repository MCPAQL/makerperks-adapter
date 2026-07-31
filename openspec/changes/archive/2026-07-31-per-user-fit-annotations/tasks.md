# Tasks — per-user fit annotations

> Backend/data/agent work — impeccable does not apply.
>
> **Decisions (from design):** model on `statusPolicy` (UserRecord field + audited
> CRUDE ops, no new DO) · slug-keyed as served, validated at set time · closed
> `fit` enum + free-text note · overlay at the read edge · ingest strips
> feed-supplied fit unconditionally.

## 1. Profile store

- [x] 1.1 `FitLevel`/`FitAnnotation` types + `UserRecord.fitAnnotations`

## 2. Operations

- [x] 2.1 `src/operations/fit.ts`: `set_program_fit` (UPDATE, slug validated
  against the loaded directory), `clear_program_fit` (DELETE),
  `get_fit_annotations` (READ); audited mutations
- [x] 2.2 Register in `app.ts` under the profile-store block

## 3. Data path

- [x] 3.1 Strip `fit`/`fit_note` in `load()` during federation (checker stays
  tolerant)

## 4. Read overlay

- [x] 4.1 Overlay the session user's annotations in `list_programs`,
  `get_program`, `search_programs`, and `upcoming_deadlines` (dated + rolling)

## 5. Tests & gates

- [x] 5.1 `test/fit-annotations.test.mjs`: set/get/clear round-trip · unknown slug
  NOT_FOUND · overlay on all four reads · no-store serves no fit · ingest strip
- [x] 5.2 Op-count assertions updated (three new ops on stored deployments)
- [x] 5.3 `npm test` + `npm run lint` green
- [x] 5.4 `npm run spec:validate per-user-fit-annotations -- --strict` passes
