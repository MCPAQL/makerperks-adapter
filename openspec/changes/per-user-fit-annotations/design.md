# Design — per-user fit annotations

## Decisions

- **Model on `statusPolicy`, not on a new store.** Fit is per-user directory
  *view* state, exactly like the status policy: a small record on `UserRecord`,
  read at query time, mutated through CRUDE ops, audited via `appendAudit`. No new
  Durable Object, no new isolation surface — the structural per-user guarantee is
  inherited.
- **Slug-keyed as served.** Annotations key on the *served* (post-prefix) slug,
  e.g. `accel:soon/program` — the identifier users see and pass to
  `set_program_fit`. Slug existence is validated against the loaded directory at
  set time (NOT_FOUND otherwise); a later feed change can orphan an annotation,
  which is harmless (it stops overlaying) and visible via `get_fit_annotations`.
- **`fit` is a closed enum (`high|medium|low`), `note` free text.** The note is
  the user's own words; it is returned only to that user.
- **Overlay at the read edge, not at ingest.** The federated directory stays
  user-free; `read.ts` decorates results with the session user's annotations right
  before returning. `upcoming_deadlines` overlays both the dated and rolling
  entries. Deployments without a profile store (the read-only worker) register no
  fit ops and overlay nothing.
- **Ingest strips feed-supplied fit.** `load()` deletes `fit`/`fit_note` from
  every ingested program, whatever the feed ships. The checker stays tolerant
  (type-checks them when present) so a feed carrying them still validates — it
  just can't inject them. This is the hard-coding guard Mick asked for: the only
  path for fit into a response is the session user's own annotations.

## Alternatives rejected

- A shared/operator fit layer (like the accepted-flows overlay) — fit is exactly
  the data that must NOT be shared; there is no curated-common-fit concept.
- Storing annotations under `MakerProfile` — the profile models identity for
  applications; fit is directory-view state, siblings with `statusPolicy`.
