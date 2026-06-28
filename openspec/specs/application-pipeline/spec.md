# application-pipeline Specification

## Purpose
TBD - created by archiving change add-application-pipeline. Update Purpose after archive.
## Requirements
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

### Requirement: Batch-with-halting via session-scoped confirmation tokens

A step whose danger level meets or exceeds the gate threshold SHALL halt the batch and
return `CONFIRMATION_REQUIRED` together with a confirmation token that is **single-use**,
**time-limited**, and **param-bound** (to the execution, stage, and inputs). The agent SHALL
resume by replaying the step with the token; the server SHALL verify and consume it. A
missing, expired, already-used, or parameter-mismatched token SHALL be rejected.

#### Scenario: Halt then resume

- **WHEN** a gated step is reached
- **THEN** the call returns `CONFIRMATION_REQUIRED` with a token, and replaying the step with
  that token proceeds past the gate exactly once

#### Scenario: A token cannot be replayed

- **WHEN** a confirmation token that was already consumed is presented again
- **THEN** it is rejected

#### Scenario: A token is bound to its parameters

- **WHEN** a token is presented for a step whose inputs differ from those it was issued for
- **THEN** it is rejected

### Requirement: Per-session execution isolation

Executions and confirmation tokens SHALL be scoped to the session and SHALL NOT be visible
across sessions or users. On the stateful endpoint this state lives in the per-session
Durable Object; over stdio it is in-process.

#### Scenario: Executions do not leak across sessions

- **WHEN** two sessions each start an application
- **THEN** neither can see or resume the other's execution

### Requirement: Opt-in Execution Safety Loop

The adapter SHALL provide an opt-in `record_execution_step` operation that evaluates an
intended action's hint against its danger level and returns an `AutonomyDirective`
(`go`, `pause`, or `stop`) with a reason. It SHALL be independent of the lifecycle
operations and SHALL manage no agent state.

#### Scenario: Low-danger action is allowed

- **WHEN** `record_execution_step` reports a low-danger intended action
- **THEN** it returns a `go` directive

#### Scenario: Gated action is paused or stopped

- **WHEN** `record_execution_step` reports an action at or above the gate threshold
- **THEN** it returns a `pause` or `stop` directive with a reason

