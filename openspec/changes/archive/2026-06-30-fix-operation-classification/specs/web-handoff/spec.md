## MODIFIED Requirements

### Requirement: A structured handoff package for non-API perks

The adapter SHALL expose a read-only `get_handoff(execution_id)` READ operation that builds
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
