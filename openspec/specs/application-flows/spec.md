# application-flows Specification

## Purpose
TBD - created by archiving change add-provider-flows. Update Purpose after archive.
## Requirements
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

### Requirement: Two-layer flow data with explicit confidence and gaps

Every program in the directory SHALL have a derivable baseline flow computed from its
published fields, marked `confidence: derived`. A curated overlay MAY provide a verified
flow per program that overrides the baseline, marked `confidence: curated`. The curated overlay
SHALL be a **loaded, portable data source** — a collection of per-perk Flow Documents
(`flows.json`), fetched on the hosted deployment and read locally, validated by the eval-free
payload checker — NOT a code-bundled constant. Every returned flow SHALL carry an explicit `gaps`
list naming what is not known and must still be discovered, so a guess is never presented as a
fact.

#### Scenario: Derived baseline for any program

- **WHEN** a program has no curated overlay
- **THEN** `get_application_flow` returns a derived baseline (`confidence: derived`) with
  `gaps` naming every unverified field (e.g. that `action_url` is the provider homepage,
  not a confirmed apply URL)

#### Scenario: Curated overlay overrides the baseline

- **WHEN** a curated Flow Document exists for a program's slug in the loaded overlay
- **THEN** the returned flow merges curated fields over the derived baseline and reports
  `confidence: curated`

#### Scenario: The overlay is loaded data, not bundled code

- **WHEN** the adapter starts
- **THEN** the curated overlay is loaded (and validated) from `flows.json` — fetched from
  `FLOWS_URL` on the hosted worker (bundled default otherwise), or read locally — so it can be
  updated and shared without changing code

### Requirement: Flow schema models both automatable and handoff applications

The flow schema SHALL represent both **API-based / self-serve** applications (an agent can
drive in-pipeline) and **web-only / manual-review** applications (a prepared handoff) via
the `automatability` field and a `submission` method, so a single schema covers the whole
directory.

#### Scenario: An automatable provider

- **WHEN** a curated provider is a self-serve API signup
- **THEN** its flow reports `automatability: api` with a `submission` method an agent can act
  on

#### Scenario: A gated provider

- **WHEN** a curated provider is a gated startup-credit application
- **THEN** its flow reports `automatability: web_only` (or `manual_review`) with an
  `action_url` for a handoff, not an in-pipeline submission

