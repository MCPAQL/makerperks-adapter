# directory-query

## ADDED Requirements

### Requirement: Reads overlay the session user's fit annotations

The directory read operations SHALL, when a per-user profile store is wired
(`list_programs`, `get_program`, `search_programs`, `upcoming_deadlines`),
decorate returned programs with the session user's `fit`/`fit_note` where that user
has annotated the slug, and SHALL serve no fit fields otherwise. The fit shown to a
user SHALL come only from their own annotations — never from feed data or another
user.

#### Scenario: An annotated program carries the user's fit

- **WHEN** a user annotates a slug `fit: high` and then lists or gets that program
- **THEN** the returned record carries `fit: "high"` (and their note), while
  unannotated programs carry no fit fields

#### Scenario: No store, no fit

- **WHEN** the same query runs on a deployment without a profile store
- **THEN** returned programs carry no fit fields
