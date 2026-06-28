## MODIFIED Requirements

### Requirement: Discoverable application-flow read surface

The adapter SHALL expose application-flow information for the directory through read-only
operations discoverable via `introspect`: `get_application_flow(slug)` SHALL return the
merged flow for one program **together with a `freshness` annotation** (`verified`, `stale`,
`age_days`) derived from the flow's `verified` date, and `list_application_flows` SHALL return
flow summaries, optionally filtered by `automatability`. These operations SHALL NOT modify state
and SHALL NOT change the existing `list_programs` / `get_program` / `search_programs` surface.

#### Scenario: Get a single program's flow

- **WHEN** a client calls `get_application_flow` with a known program slug
- **THEN** it receives that program's merged application flow (automatability, required
  inputs, submission, redemption, danger level, confidence, and gaps) and a `freshness`
  annotation indicating whether the curated flow has aged past the staleness TTL

#### Scenario: Unknown slug

- **WHEN** `get_application_flow` is called with a slug that is not in the directory
- **THEN** it returns a `NOT_FOUND_RESOURCE` error

#### Scenario: Discover in-pipeline vs. handoff perks

- **WHEN** a client calls `list_application_flows` filtered by `automatability` (e.g. `api`)
- **THEN** it receives the summaries of perks whose flow matches, so an agent can tell which
  perks are in-pipeline vs. a web-only/manual handoff

#### Scenario: The new operations are introspectable

- **WHEN** a client calls `introspect`
- **THEN** `get_application_flow` and `list_application_flows` are listed with their
  parameters and types, alongside the existing READ operations
