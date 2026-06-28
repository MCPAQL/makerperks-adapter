## ADDED Requirements

### Requirement: A structured handoff package for non-API perks

The adapter SHALL expose a read-only `get_handoff(execution_id)` EXECUTE operation that builds
a structured handoff package for an in-flight execution from its accumulated inputs, the maker
profile, and the program's application flow. The package SHALL carry the `slug`, `provider`,
`title`, `automatability`, `action_url`, `method`, `instructions`, `danger_level`,
`confidence`, `gaps`, an `eligibility_notice`, and split the flow's required inputs into
`assembled_inputs` (value known) and `pending_inputs` (still needed). `get_handoff` SHALL NOT
make external calls and SHALL NOT drive a browser. An unknown `execution_id` SHALL return a
`NOT_FOUND_RESOURCE` error.

#### Scenario: A web_only execution yields a complete handoff package

- **WHEN** `get_handoff` is called for an execution whose flow is `web_only`
- **THEN** it returns a package with the apply `action_url`, `instructions`, the
  profile-filled `assembled_inputs`, the `pending_inputs` still needed, the `danger_level`,
  and the flow `gaps`

#### Scenario: Unknown execution

- **WHEN** `get_handoff` is called with an unknown `execution_id`
- **THEN** it returns a `NOT_FOUND_RESOURCE` error

### Requirement: The handoff package never contains a secret

The handoff package SHALL NOT contain any secret value. A `source: "credential"` required input
SHALL appear only in `pending_inputs` (with a reason indicating it must be supplied out-of-band)
and SHALL NOT carry its value, even when the maker has a matching vault credential.
`assembled_inputs` SHALL contain only non-secret, profile- or input-derived values.

#### Scenario: A credential-sourced field is pending, not assembled, and value-free

- **WHEN** a flow has a `source: "credential"` required input and a handoff is built
- **THEN** that field appears in `pending_inputs` with an out-of-band reason and no value, and
  does not appear in `assembled_inputs`

### Requirement: Eligibility is surfaced, never auto-decided or hard-blocked

The handoff package SHALL carry an `eligibility_notice` and the flow's eligibility `gaps`, so
the maker can decide informed. The adapter SHALL neither auto-assert nor auto-deny eligibility:
for `manual_review` flows or flows with `danger_level >= 2` the notice SHALL state that
eligibility is the maker's to assert (neither auto-asserted nor auto-denied). `get_handoff` and
`submit_step` SHALL NOT refuse to proceed on eligibility grounds — there is no hard lock; a
maker who judges their project eligible may proceed (including simulating a follow-through).

#### Scenario: A gated flow's handoff surfaces eligibility without deciding it

- **WHEN** `get_handoff` is called for a `manual_review` or danger ≥ 2 flow
- **THEN** the package's `eligibility_notice` states eligibility is the maker's to assert
  (neither auto-asserted nor auto-denied), the eligibility `gaps` are present, and the package
  is still returned (no hard block)
