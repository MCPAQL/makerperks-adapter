## MODIFIED Requirements

### Requirement: Acceptance autonomy dial

The adapter SHALL support three acceptance modes — **review_each** (default), **auto_low_risk**,
and **full_auto** — settable via `set_acceptance_mode` and readable via `get_acceptance_mode`,
governing whether an eligible proposal is auto-accepted at submission. In **review_each** no
proposal is auto-accepted (every one waits for an explicit `accept_flow`). In **auto_low_risk** a
proposal is auto-accepted only when it is `ready_for_proposal` **and** `danger_level ≤ 1`. In
**full_auto** a proposal is auto-accepted when it is `ready_for_proposal` **and** `danger_level ≤
2`. In **every** mode the verification gate runs, eligibility is never auto-asserted (an
eligibility finding makes a proposal not-ready, so it cannot auto-accept), and a proposal with
`danger_level ≥ 3` (payment / real identity) SHALL never be auto-accepted — it requires an explicit
human `accept_flow`. A proposal whose **effective served flow** requires a stored vault credential
SHALL **never** be auto-accepted in any mode — publishing it would put a stored secret in play for
every user — and SHALL wait for an explicit human `accept_flow`. The credential check SHALL be
evaluated on the served flow (the curated overlay merged over the derived baseline), so a
`source: "credential"` input the candidate **inherits** from the baseline (and does not itself
declare) still blocks auto-accept.

#### Scenario: Default is review_each

- **WHEN** a fresh registry reads `get_acceptance_mode`
- **THEN** the mode is `review_each`, and a new `propose_flow` stays pending

#### Scenario: auto_low_risk auto-accepts only ready low-danger proposals

- **WHEN** the mode is `auto_low_risk` and a `ready_for_proposal` candidate with `danger_level ≤ 1`
  is proposed
- **THEN** it is accepted automatically; a `danger_level ≥ 2` or not-ready candidate stays pending

#### Scenario: danger ≥ 3 is never auto-accepted

- **WHEN** the mode is `full_auto` and a `ready_for_proposal` candidate with `danger_level ≥ 3` is
  proposed
- **THEN** it stays pending for an explicit human `accept_flow` (the challenge floor), and is not
  served until then

#### Scenario: A credential-bearing flow is never auto-accepted

- **WHEN** the mode is `full_auto` and a `ready_for_proposal` candidate at `danger_level ≤ 2` whose
  `required_inputs` include a `source: "credential"` input is proposed
- **THEN** it stays pending for an explicit human `accept_flow`, and is not served until then

#### Scenario: An inherited credential input blocks auto-accept

- **WHEN** the mode is `full_auto` and a `ready_for_proposal`, danger-0 candidate omits
  `required_inputs` for a program whose derived baseline carries a `source: "credential"` input
- **THEN** the proposal stays pending (the inherited credential input is detected on the served
  flow), not auto-accepted
