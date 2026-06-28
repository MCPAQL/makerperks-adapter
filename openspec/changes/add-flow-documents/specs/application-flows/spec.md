## MODIFIED Requirements

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
