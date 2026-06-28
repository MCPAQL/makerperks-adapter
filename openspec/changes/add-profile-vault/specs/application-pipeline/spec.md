## MODIFIED Requirements

### Requirement: Simulated EXECUTE application lifecycle

The adapter SHALL expose an `EXECUTE` operation family — `start_application`,
`submit_step`, `get_status` — that drives a perk application through the lifecycle
`eligibility → assemble → submission → verification → redeem`
(`pending → running → completed`) over the program's application flow. Submission SHALL be
**simulated**: it SHALL NOT make external calls and SHALL return a result explicitly marked
as simulated. The operations SHALL be reachable via a `mcp_aql_execute` tool and SHALL be
listed by `introspect`; the existing `mcp_aql_read` READ surface SHALL be unchanged.

When a maker profile is available, the `assemble` stage SHALL fill the flow's
`required_inputs` from the profile, with any per-call `inputs` taking precedence, so that
`missing_inputs` reflects only what the profile genuinely lacks. The `submission` stage MAY
reference a stored vault credential by id; such use SHALL be **simulated** (the result names
the credential's label, never its value), SHALL be gated by the autonomy switch and a
confirmation token, and SHALL be recorded in the per-user audit log. Eligibility SHALL still
never be auto-asserted.

#### Scenario: Drive an application to completion

- **WHEN** an agent calls `start_application` for a program and then `submit_step` through
  the stages, providing required inputs
- **THEN** the execution advances `pending → running → completed`, and the submission stage
  returns a result marked `simulated` with no external side effect

#### Scenario: Status of an in-flight execution

- **WHEN** `get_status` is called with an execution id
- **THEN** it returns the current stage, status, the next required step, and the flow's gaps

#### Scenario: Unknown execution

- **WHEN** `get_status` or `submit_step` is called with an unknown execution id
- **THEN** it returns a `NOT_FOUND_RESOURCE` error

#### Scenario: Assemble fills inputs from the profile

- **WHEN** a profile exists and `submit_step` reaches the `assemble` stage without supplying a
  field the profile already holds
- **THEN** that field is filled from the profile and `missing_inputs` does not list it

#### Scenario: Per-call inputs override the profile

- **WHEN** a per-call `inputs` value conflicts with a profile value at `assemble`
- **THEN** the per-call value is used

#### Scenario: A referenced vault secret is simulated, gated, and audited

- **WHEN** `submit_step` at `submission` references a vault credential by id
- **THEN** the use halts for confirmation under the autonomy mode, the simulated result names
  the credential's label but not its value, and an audit entry is recorded
