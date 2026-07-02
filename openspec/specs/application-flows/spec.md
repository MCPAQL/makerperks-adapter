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
payload checker — NOT a code-bundled constant. **When an acceptance registry is wired (#47 piece
D), its accepted overlay SHALL form a third, highest-precedence layer over the loaded `flows.json`
overlay** — so a freshly accepted Flow Document is served immediately (still `confidence: curated`)
without redeploy; when no registry is wired (the read-only endpoint), the served flow is the
baseline ⊕ `flows.json` overlay exactly as before. Every returned flow SHALL carry an explicit
`gaps` list naming what is not known and must still be discovered, so a guess is never presented as
a fact.

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

#### Scenario: An accepted flow overrides the loaded overlay

- **WHEN** an acceptance registry is wired and a Flow Document for a slug has been accepted into
  its accepted overlay
- **THEN** `get_application_flow` for that slug returns the accepted Flow Document (highest
  precedence, `confidence: curated`), and with no registry wired the result is unchanged from the
  baseline ⊕ `flows.json` overlay

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

### Requirement: An oauth_signup flow can advertise its OAuth providers

A flow's `submission` SHALL support an optional `oauth_providers` list naming the OAuth providers the
signup page offers (e.g. `["google", "github", "azure"]`). It SHALL be authored on a curated Flow
Document (the derived baseline does not know a provider's OAuth buttons) and SHALL carry through the
curated overlay merge unchanged. Each entry SHALL be validated against the known OAuth-provider set;
an unknown provider SHALL be rejected. `oauth_providers` SHALL be valid ONLY when the submission
`method` is `oauth_signup`; declaring it on any other method SHALL be a validation error (otherwise
the handoff could surface OAuth buttons for a plain web-form or api flow). The list is descriptive
(which buttons exist) and grants no new authority. The discovery-brief Flow Document contract
(`curatedFlowContract`) SHALL advertise the valid OAuth-provider enum so an agent authoring a flow
discovers the same values the validator enforces (no drift between brief and gate).

#### Scenario: A curated flow declares its OAuth providers

- **WHEN** a curated Flow Document sets `submission.oauth_providers: ["github", "google"]` on an
  `oauth_signup` flow
- **THEN** the merged flow served for that program carries those providers

#### Scenario: An unknown OAuth provider is rejected

- **WHEN** a curated overlay declares an `oauth_providers` entry that is not a known provider
- **THEN** the overlay fails validation

#### Scenario: oauth_providers on a non-oauth_signup method is rejected

- **WHEN** a curated overlay declares `oauth_providers` on a submission whose `method` is not
  `oauth_signup` (e.g. `web_form`)
- **THEN** the overlay fails validation

