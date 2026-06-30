## MODIFIED Requirements

### Requirement: Per-user flow health via report_flow_outcome

The adapter SHALL record per-user flow health in the user's record (`flowHealth` keyed by slug:
last success, last failure, consecutive `failure_count`, last note) through a
`report_flow_outcome(slug, outcome, note?)` operation. A `success` SHALL reset `failure_count`
to zero; a `failure` SHALL increment it. When `failure_count` reaches the re-discovery threshold,
the flow SHALL be flagged for re-discovery. Each report SHALL append an audit entry. The
operation SHALL require the per-user store and SHALL NOT be present on the anonymous read-only
endpoint. `report_flow_outcome` SHALL carry the **UPDATE** semantic category: it upserts the
evolving per-slug `flowHealth` aggregate (a default record is lazily initialized on first touch,
not created by the caller).

#### Scenario: A success resets a failing streak

- **WHEN** `report_flow_outcome` records a failure and then a success for a slug
- **THEN** the slug's `failure_count` is back to zero and it is not flagged for re-discovery

#### Scenario: Repeated failures flag re-discovery

- **WHEN** `report_flow_outcome` records failures up to the threshold for a slug
- **THEN** the slug is flagged for re-discovery, and an audit entry exists for each report
