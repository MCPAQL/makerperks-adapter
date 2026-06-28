## MODIFIED Requirements

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
