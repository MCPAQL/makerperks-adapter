## ADDED Requirements

### Requirement: The server hands the agent a complete application package; the agent applies

The application pipeline SHALL drive a **real** application by giving the connected agent everything
it needs to apply, rather than simulating the act. At the submission stage, `submit_step` SHALL
return an **application package** — the apply URL, method, instructions, the assembled inputs, the
pending inputs, the danger level, the gaps, and the eligibility notice — for **both** API and web
flows. The adapter SHALL NOT itself perform the application (no outbound provider call) and SHALL NOT
drive a browser; the connected agent performs the call or browser automation with its own tools. The
submission stage SHALL advance the execution to `verification`, awaiting the agent's result.

#### Scenario: Submission returns the package, not a simulation

- **WHEN** `submit_step` reaches the submission stage of an API flow (past any confirmation gate)
- **THEN** it returns the application package (apply URL, method, assembled/pending inputs, danger,
  gaps) and advances to `verification`, and the result contains no "SIMULATED" submission

#### Scenario: Web flows get the same package shape

- **WHEN** the flow is web-only / manual-review
- **THEN** the same package is provided (the browser handoff), and the adapter still does not drive a
  browser — the agent does

### Requirement: The agent's reported result is recorded as the real outcome

At the verification stage, `submit_step` SHALL accept a `result` reported by the agent
(`{ ok, detail?, data? }`) — the outcome of the call/automation it performed — and record it as the
execution's real outcome, with redeem reflecting it and the audit recording the real action (not a
simulation). When no result is supplied, it SHALL indicate it is awaiting the agent's result rather
than asserting success.

#### Scenario: A reported success completes the application

- **WHEN** the agent performs the submission and calls `submit_step` at verification with
  `result: { ok: true, ... }`
- **THEN** verification records the real outcome, redeem reflects it, and the audit/log carry no
  "SIMULATED" markers

#### Scenario: A reported failure is recorded, not glossed

- **WHEN** the agent reports `result: { ok: false, detail }`
- **THEN** the execution records the failure (it does not claim success)

### Requirement: Credential delivery is danger-tiered

When a flow requires a stored credential to apply, the package SHALL include it only by danger tier:
for a flow at **danger ≤ 2**, the credential SHALL be decrypted from the vault and included in the
package's assembled inputs so the agent can authenticate, and its use SHALL be audited as a real use;
for a flow at **danger ≥ 3** (payment / real identity), the credential SHALL NEVER be exposed — it
stays pending for out-of-band supply. When no vault key is available, a credential SHALL stay pending
regardless of tier (fail safe). A flow that needs no stored credential SHALL apply with inputs and
URL alone.

#### Scenario: A low-danger credential is included for the agent

- **WHEN** a danger ≤ 2 flow requests a vault credential and a vault key is available
- **THEN** the credential is decrypted and appears in the package's assembled inputs, and its use is
  audited

#### Scenario: A high-danger credential is never exposed

- **WHEN** a danger ≥ 3 flow requests a vault credential
- **THEN** the credential is not decrypted or included; it remains pending for out-of-band supply

#### Scenario: No vault key fails safe

- **WHEN** no vault key is configured and a flow requests a credential
- **THEN** the credential stays pending regardless of danger level
