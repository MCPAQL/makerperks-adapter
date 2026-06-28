## ADDED Requirements

### Requirement: Model-agnostic discovery toolkit

The adapter SHALL expose flow discovery as a **model- and provider-agnostic toolkit** the server
provides to a connected LLM agent: the server SHALL provide only the model-free parts (the
research brief, the schema/provenance/eligibility verification, the overlay diff, and the
discovery entry point), and the connected MCP agent SHALL supply the research, generation, and
adversarial refutation. No provider SDK SHALL be a runtime or test dependency of this repo. All
discovery operations SHALL be read-only (no state mutation), discoverable via `introspect`, and
available on every deployment including the read-only endpoint.

#### Scenario: The discovery operations are introspectable and read-only

- **WHEN** a client calls `introspect`
- **THEN** `get_discovery_brief`, `verify_flow_proposal`, `diff_flow_proposal`, and
  `start_flow_discovery` are listed with their parameters and types as READ operations, and none
  of them modifies server state

#### Scenario: No model runs inside the server or its tests

- **WHEN** the discovery toolkit is exercised (a brief is built, a candidate is verified or
  diffed, fidelity is scored)
- **THEN** the result is a pure function of `perks.json`, the curated overlay, and the candidate —
  the server calls no model and depends on no provider SDK

### Requirement: Discovery brief scaffold

A `get_discovery_brief(slug)` read operation SHALL return the scaffold an agent investigates
against: the program's `perks.json` fields, the derived baseline and its explicit `gaps`, the
target Flow Document contract (field names and allowed enums, drawn from the same source as the
overlay validator), and a verification contract (provenance + eligibility-surfaced rules + an
adversarial checklist). It SHALL return a `NOT_FOUND_RESOURCE` error for an unknown slug.

#### Scenario: A brief seeds discovery for a known perk

- **WHEN** a client calls `get_discovery_brief` with a known program slug
- **THEN** it receives the program record, the derived baseline, the baseline's `gaps`, the target
  contract, and the verification contract — a starting point for research, not a blank page

#### Scenario: The brief's target contract matches what verification enforces

- **WHEN** the brief's target contract lists the allowed values for an overlay field
- **THEN** those values are the same ones `verify_flow_proposal` enforces (one source of truth —
  no drift between the promised contract and the accepted schema)

#### Scenario: Unknown slug

- **WHEN** `get_discovery_brief` is called with a slug that is not in the directory
- **THEN** it returns a `NOT_FOUND_RESOURCE` error

### Requirement: Model-free proposal verification

A `verify_flow_proposal(slug, candidate)` read operation SHALL run the model-free gates on a
candidate Flow Document and return a structured verdict without mutating state: schema validity
(via the eval-free overlay validator), provenance findings (a candidate that sets substantive
curated claims but carries no provenance — neither a `source` docs URL nor a `sources[]` entry —
or that is missing a `verified` date), and eligibility findings (any criterion recorded as data
rather than surfaced in `gaps`). It SHALL also return the adversarial checklist the agent must
execute semantically. A `ready_for_proposal` flag SHALL be true only when the schema is valid and
there are no provenance or eligibility findings; it SHALL NOT constitute an acceptance decision,
and eligibility SHALL never be asserted nor auto-denied.

#### Scenario: A well-sourced candidate passes the structural gates

- **WHEN** `verify_flow_proposal` is given a candidate that is schema-valid, carries provenance (a
  `source` docs URL and/or `sources[]`) and a `verified` date, and leaves eligibility criteria in
  `gaps`
- **THEN** `schema_valid` is true, there are no provenance or eligibility findings, and
  `ready_for_proposal` is true

#### Scenario: A guessed or unsourced claim is flagged, not accepted

- **WHEN** a candidate sets substantive curated claims with no provenance (no `source` and no
  `sources[]`) or with no `verified` date
- **THEN** it appears in the provenance findings and `ready_for_proposal` is false

#### Scenario: Asserted eligibility is flagged and never recorded as satisfied

- **WHEN** a candidate records an eligibility criterion as satisfied rather than placing it in
  `gaps`
- **THEN** it appears in the eligibility findings, `ready_for_proposal` is false, and the server
  neither asserts the eligibility nor hard-blocks the perk

### Requirement: Proposal diff against the served overlay

A `diff_flow_proposal(slug, candidate)` read operation SHALL return a field-level diff of the
candidate against the current `flows.json` overlay entry for the slug — fields added, changed, or
removed — so a proposal's delta against what is currently served is reviewable. When there is no
current overlay entry, every populated field SHALL be reported as added.

#### Scenario: The diff reports changed and added fields

- **WHEN** `diff_flow_proposal` is given a candidate that changes one field and adds another
  relative to the current overlay entry
- **THEN** the diff reports the changed field with its before/after and the added field

#### Scenario: An uncurated slug diffs as all-added

- **WHEN** `diff_flow_proposal` is given a candidate for a slug with no current overlay entry
- **THEN** every populated candidate field is reported as added

### Requirement: Discovery entry point

A `start_flow_discovery(slug)` read operation SHALL drive the cache → discover loop in one call:
when the cached flow is fresh — and, where a per-user store is wired, not flagged for
re-discovery — it SHALL return `{action: "use", flow, freshness}`; otherwise it SHALL return
`{action: "discover", reason, brief}` with the reason (`uncurated` / `stale` / `rediscover`) and
the discovery brief attached. It SHALL call no model.

#### Scenario: A fresh flow is used, not re-discovered

- **WHEN** `start_flow_discovery` is called for a slug whose curated flow is fresh (and not failing
  where health is available)
- **THEN** it returns `action: "use"` with the merged flow and its freshness

#### Scenario: A missing or stale flow returns a discovery brief

- **WHEN** `start_flow_discovery` is called for a slug that is uncurated or whose curated flow is
  stale
- **THEN** it returns `action: "discover"`, the reason, and the discovery brief to act on

### Requirement: Fidelity oracle over the spikes

The adapter SHALL provide a fidelity measure that scores a candidate Flow Document against a
known-good flow by field-level agreement (weighting the load-bearing fields: automatability,
submission method/url, required inputs, redemption type, danger level). The three hand-curated
spikes SHALL be regenerable through the toolkit and scored against their known-good `flows.json`
entries as the de-risking metric. The scorer and gates SHALL be exercised with the spikes as
fixtures without calling any model.

#### Scenario: A known-good candidate scores at the top of the range

- **WHEN** a spike's known-good overlay entry is scored against itself
- **THEN** the fidelity score is at the top of the range (perfect agreement)

#### Scenario: A degraded candidate scores lower

- **WHEN** a candidate that diverges from a spike on a load-bearing field is scored against the
  known-good entry
- **THEN** the fidelity score is lower than the known-good baseline
