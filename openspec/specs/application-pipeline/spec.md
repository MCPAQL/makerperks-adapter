# application-pipeline Specification

## Purpose
TBD - created by archiving change add-application-pipeline. Update Purpose after archive.
## Requirements
### Requirement: Simulated EXECUTE application lifecycle

The adapter SHALL expose an `EXECUTE` operation family — `start_application` and `submit_step` —
that drives a perk application through the lifecycle
`eligibility → assemble → submission → verification → redeem`
(`pending → running → completed`) over the program's application flow. The inspection
operations `get_status` and `get_handoff` are **READ** operations on the `mcp_aql_read` surface,
not EXECUTE. Submission SHALL be **simulated**: it SHALL NOT make external calls and SHALL return
a result explicitly marked as simulated. The EXECUTE operations SHALL be reachable via a
`mcp_aql_execute` tool and SHALL be listed by `introspect`; the existing `mcp_aql_read` READ
surface SHALL be unchanged.

When a maker profile is available, the `assemble` stage SHALL fill the flow's
`required_inputs` from the profile, with any per-call `inputs` taking precedence, so that
`missing_inputs` reflects only what the profile genuinely lacks. The `submission` stage MAY
reference a stored vault credential by id; such use SHALL be **simulated** (the result names
the credential's label, never its value), SHALL be gated by the autonomy switch and a
confirmation token, and SHALL be recorded in the per-user audit log. Eligibility SHALL still
never be auto-asserted.

For a flow whose `automatability` is **not** `api` (`web_only` / `manual_review`), the
`submission` stage SHALL NOT claim a simulated submission; instead it SHALL report that a web
handoff is available and point to the `get_handoff` operation, which prepares a structured
handoff package for an external browser-automation agent. The adapter SHALL NOT drive a browser.

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

#### Scenario: A non-API submission points to a web handoff

- **WHEN** `submit_step` reaches the `submission` stage for a `web_only` or `manual_review` flow
- **THEN** the result does not claim a simulated submission, flags that a handoff is available,
  and directs the agent to `get_handoff` for the prepared package

### Requirement: Batch-with-halting via session-scoped confirmation tokens

A step whose danger level meets or exceeds the gate threshold SHALL halt the batch and
return `CONFIRMATION_REQUIRED` together with a confirmation token that is **single-use**,
**time-limited**, and **param-bound** (to the execution, stage, inputs, and — when the submission
uses a stored credential — the **credential id**). The agent SHALL resume by replaying the step
with the token; the server SHALL verify and consume it. A missing, expired, already-used, or
parameter-mismatched token SHALL be rejected, and a token replayed with a different `credential_id`
than the one it was issued for SHALL be rejected (an approval for one stored secret cannot
authorize a different one).

A `submission` step that will unseal a stored vault credential (a `credential_id` is supplied)
SHALL floor the gate danger to at least the pause tier, so a credential is never used under
`auto_low_risk` without halting for the human; `full_auto` MAY still auto-proceed (the maker's
explicit choice) and only a `scoped_token` is ever auto-filled (see the `live-application`
credential tier).

The confirmation token is agent-replayable and SHALL NOT be presented as a standalone
out-of-band human challenge. The **primary** human approval is the host's tool-permission prompt
on the mutating `mcp_aql_execute` endpoint; the token is a **host-independent fallback** for hosts
that do not gate tool calls. At `danger ≥ 3` the gated step additionally keeps any vault credential
sealed regardless of confirmation (see `live-application`).

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

#### Scenario: A token cannot authorize a different credential

- **WHEN** a token issued for a submission with `credential_id` A is replayed with `credential_id` B
- **THEN** it is rejected

#### Scenario: A credential-using submission floors to a pause

- **WHEN** the autonomy mode is `auto_low_risk` and a danger-0 submission supplies a `credential_id`
- **THEN** the step halts for confirmation (the gate danger is floored), whereas the same danger-0
  submission without a credential proceeds without halting

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
operations and SHALL manage no agent state. Because it persists nothing, `record_execution_step`
SHALL be a **READ** operation (despite its name).

#### Scenario: Low-danger action is allowed

- **WHEN** `record_execution_step` reports a low-danger intended action
- **THEN** it returns a `go` directive

#### Scenario: Gated action is paused or stopped

- **WHEN** `record_execution_step` reports an action at or above the gate threshold
- **THEN** it returns a `pause` or `stop` directive with a reason

