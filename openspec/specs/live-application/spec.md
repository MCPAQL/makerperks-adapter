# live-application Specification

## Purpose
Turn the application pipeline from a simulation into a real one (#91), under the project's model: the
**MCP server is the toolkit + information provider, not the executor.** At the submission stage
`submit_step` hands the connected agent a complete **application package** (apply URL, method,
assembled inputs, danger, gaps, eligibility) for **both** API and web flows; the agent performs the
call or browser automation with its **own** tools and reports the outcome back via a `result`, which
the pipeline records as the real verification (it never asserts success without one). Credentials are
delivered **danger-tiered**: a danger ≤ 2 flow's vault credential is decrypted into the package so the
agent can authenticate; danger ≥ 3 (payment / real identity) is never exposed (stays out-of-band);
no vault key keeps it pending — fail safe. The whole safety scaffold (autonomy switch, confirmation
tokens, danger gating, profile assembly, audit) is unchanged. The adapter makes no external call and
never drives a browser — it provides the package and the gates; the agent does the doing.
## Requirements
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

When a flow requires a stored credential to apply, the package SHALL include it only by **kind and
danger tier**: a credential SHALL be decrypted from the vault and included in the package's
assembled inputs (its use audited as a real use) ONLY when it is a **`scoped_token`** AND the flow
is at **danger ≤ 2**. A `password` or `identity_document` SHALL **never** be auto-exposed,
regardless of danger level — it stays pending for out-of-band supply (a reusable password / an
irreplaceable identity document is not auto-filled). For a flow at **danger ≥ 3** (payment / real
identity) **no** credential SHALL be exposed. When no vault key is available, a credential SHALL
stay pending regardless of tier (fail safe). A flow that needs no stored credential SHALL apply with
inputs and URL alone.

#### Scenario: A low-danger scoped_token is included for the agent

- **WHEN** a danger ≤ 2 flow requests a `scoped_token` vault credential and a vault key is available
- **THEN** the credential is decrypted and appears in the package's assembled inputs, and its use is
  audited

#### Scenario: A password or identity_document is never auto-exposed

- **WHEN** a danger ≤ 2 flow requests a `password` or `identity_document` vault credential
- **THEN** the credential is not decrypted or included; it remains pending for out-of-band supply

#### Scenario: A high-danger credential is never exposed

- **WHEN** a danger ≥ 3 flow requests a vault credential of any kind
- **THEN** the credential is not decrypted or included; it remains pending for out-of-band supply

#### Scenario: No vault key fails safe

- **WHEN** no vault key is configured and a flow requests a credential
- **THEN** the credential stays pending regardless of danger level

