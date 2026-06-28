# flow-documents Specification

## Purpose
TBD - created by archiving change add-flow-documents. Update Purpose after archive.
## Requirements
### Requirement: Portable per-perk Flow Documents loaded from flows.json

The curated application-flow overlay SHALL be a collection of portable per-perk **Flow
Documents** — each the curated flow for one slug (automatability, submission, required_inputs,
redemption, danger_level, gaps) plus provenance (`source` / `sources`, `verified`) — published as
a **`flows.json`** map (slug → document). The adapter SHALL load this overlay through a
`FlowSource` that validates it with the existing eval-free payload checker and fails loud on a
schema-invalid collection. Unknown additive fields SHALL be tolerated (forward-compatible with
later freshness/health fields).

#### Scenario: The overlay loads from flows.json

- **WHEN** the adapter loads a valid `flows.json`
- **THEN** each entry is available as the curated overlay for its slug, merged over the derived
  baseline by `get_application_flow`, with the same results as the previous bundled overlay

#### Scenario: A schema-invalid flows.json fails loud

- **WHEN** `flows.json` contains an entry that violates the flow schema
- **THEN** loading fails with a validation error rather than serving a malformed overlay

### Requirement: flows.json is fetched on the hosted worker, with a bundled default

On the hosted (Workers) deployment the `FlowSource` SHALL fetch the overlay from a configurable
`FLOWS_URL` (as the data source fetches `perks.json`), so the overlay can be updated without a
redeploy. When no source is configured, the adapter SHALL fall back to a bundled `flows.json`, so
a curated overlay is always available out of the box. Local deployments SHALL be able to read the
overlay from a file or URL.

#### Scenario: Fetched override

- **WHEN** `FLOWS_URL` is set on the hosted worker
- **THEN** the overlay is fetched from that URL and refreshed per its TTL, with no redeploy needed
  to change the flows

#### Scenario: Bundled default

- **WHEN** no flow-source URL is configured
- **THEN** the adapter serves the bundled `flows.json` overlay

