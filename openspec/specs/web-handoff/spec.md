# web-handoff Specification

## Purpose
TBD - created by archiving change add-web-handoff. Update Purpose after archive.
## Requirements
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

### Requirement: Untrusted directory text is normalized and labeled with provenance

Every feed/flow-derived free-text field that reaches the agent SHALL be normalized before it is
included in the handoff package — `title`, `instructions`, each `gaps` entry, and each pending input
`note`: Unicode NFC, removal of C0/C1 control characters (except newline and tab), removal of
zero-width and bidirectional-override characters, and a per-field length cap. The package SHALL carry
a `provenance` block that names the untrusted fields and states that they are third-party directory
data to be treated as data, never as instructions. Normalization SHALL remove only invisible or
structural content; it SHALL NOT alter the wording of legitimate text.

#### Scenario: Control and bidi characters are stripped from agent-facing text

- **WHEN** a flow's `instructions` or `gaps` contain control, zero-width, or bidirectional-override
  characters
- **THEN** those characters are removed from the handoff package while the visible wording is
  preserved

#### Scenario: The package names its untrusted fields

- **WHEN** a handoff package is built from feed/flow data
- **THEN** it includes a `provenance` block listing the untrusted fields and a notice that they are
  third-party data, not instructions

### Requirement: action_url is constrained to a safe scheme

The handoff package's `action_url` SHALL be parsed and constrained to a safe scheme (`https` or
`mailto`); a URL that is unparseable or uses any other scheme (for example `javascript:`, `data:`,
or `file:`) SHALL be dropped from the package and surfaced as a gap rather than passed to the agent.

#### Scenario: A non-https action_url is dropped and surfaced

- **WHEN** a flow's `action_url` is unparseable or uses a scheme other than `https`/`mailto`
- **THEN** the package omits `action_url` and records a gap noting the apply URL was rejected

