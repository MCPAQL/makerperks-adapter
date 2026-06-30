# flow-health Specification

## Purpose
TBD - created by archiving change add-flow-health. Update Purpose after archive.
## Requirements
### Requirement: Derived flow freshness

A curated flow SHALL be considered **stale** when its `verified` date is older than a staleness
TTL (default 90 days); a flow without a `verified` date SHALL NOT be considered stale (it is
unverified, which the flow `gaps` already state). Freshness SHALL be derived at read time from
the flow document — no stored state — and SHALL be surfaced as a `freshness` annotation
(`verified`, `stale`, `age_days`) on `get_application_flow`, available on every deployment
including the read-only endpoint.

#### Scenario: A recently-verified flow is fresh; an old one is stale

- **WHEN** `get_application_flow` returns a curated flow whose `verified` date is within the TTL
- **THEN** its `freshness.stale` is false; and when the `verified` date is older than the TTL,
  `freshness.stale` is true

#### Scenario: A derived baseline is not stale

- **WHEN** `get_application_flow` returns a derived baseline (no `verified` date)
- **THEN** `freshness.stale` is false (it is unverified, not stale)

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

### Requirement: get_flow_status recommends use / reverify / rediscover

A `get_flow_status(slug)` read operation SHALL return the flow's freshness, the per-user health,
and a `recommendation`: **rediscover** when flagged by failures, else **reverify** when stale,
else **use**. It SHALL require the per-user store (health is per-user).

#### Scenario: A flagged flow recommends rediscover

- **WHEN** a slug is flagged for re-discovery (failures) and `get_flow_status` is called
- **THEN** the `recommendation` is `rediscover`

#### Scenario: A stale but healthy flow recommends reverify

- **WHEN** a slug is stale (aged past the TTL) but not failing
- **THEN** the `recommendation` is `reverify`

#### Scenario: A fresh healthy flow recommends use

- **WHEN** a slug is neither stale nor failing
- **THEN** the `recommendation` is `use`

