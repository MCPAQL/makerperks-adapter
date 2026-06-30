## MODIFIED Requirements

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
