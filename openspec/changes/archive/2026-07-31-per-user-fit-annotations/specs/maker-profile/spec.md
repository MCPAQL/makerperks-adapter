# maker-profile

## ADDED Requirements

### Requirement: Per-user program-fit annotations

The per-user record SHALL store program-fit annotations — program slug →
`{ fit: high | medium | low, note? }` — settable via `set_program_fit` (which SHALL
reject a slug not present in the loaded directory), removable via
`clear_program_fit`, and readable via `get_fit_annotations`. These operations SHALL
register only where a per-user profile store is wired, mutations SHALL be audited,
and one user's annotations SHALL never be visible to another user or to anonymous
deployments.

#### Scenario: Set, read, and clear an annotation

- **WHEN** a user sets `set_program_fit` for a directory slug with `fit: high` and
  a note, then reads `get_fit_annotations`, then clears it
- **THEN** the annotation round-trips with their fit and note, and after clearing
  it is absent

#### Scenario: Unknown slug is rejected

- **WHEN** `set_program_fit` names a slug not in the loaded directory
- **THEN** the operation fails with a not-found error and stores nothing

#### Scenario: Annotations are per-user only

- **WHEN** a deployment has no per-user profile store (the anonymous read-only
  endpoint)
- **THEN** no fit operations are registered and no fit data is served
