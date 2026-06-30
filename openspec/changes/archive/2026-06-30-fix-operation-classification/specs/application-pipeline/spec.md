## MODIFIED Requirements

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
