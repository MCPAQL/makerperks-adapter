## Why

The application pipeline currently **simulates** the act of applying (`submit_step`'s submission /
verification / redeem stages emit `"SIMULATED …"`, and a vault credential is "would inject …
(simulated, not decrypted)"). The whole safety scaffold is real — autonomy switch, confirmation
tokens, danger gating, profile assembly, audit — but nothing actually applies (#91).

The fix follows the project's core model: **the MCP server is the toolkit + information provider, not
the executor.** The connected AI agent does the actual application with its own tools (HTTP; browser
automation if the flow needs it — the agent brings that). The server's job is to hand the agent
**everything it needs to apply** and take its reported result back through verification under the same
gates. The server already builds exactly that package (`buildHandoff` → apply URL, method, assembled
inputs, pending fields, danger, gaps, eligibility) — generic, not web-specific. So completing the
stub is mostly *using* that package for API flows instead of simulating, plus delivering credentials
under a danger tier.

## What Changes

- **The application package, for any flow.** Generalize the existing handoff package as the unified
  "here's everything you need to apply" package for **both** API and web flows (it already carries
  `automatability`, `action_url`, `method`, assembled vs pending inputs, danger, gaps, eligibility).
- **`submit_step` drives a real application, not a simulation:**
  - **submission stage** returns the application **package** (the action for the agent to perform) —
    no `"SIMULATED submission"`. The execution advances to `verification` awaiting the agent's result.
  - **verification stage** consumes the agent's **reported result** (`result` input: ok/failed +
    any returned data/identifiers) and records it as the real outcome — no `"SIMULATED verification"`.
  - **redeem** reflects the reported outcome. The audit records the real action, not "simulated".
- **Danger-tiered credentials** (decided 2026-06-29): when a flow needs a stored credential, a flow
  at **danger ≤ 2** has the credential **decrypted from the vault and included** in the package so the
  agent can make the authenticated call; **danger ≥ 3** (payment / real identity) **never** exposes it
  — it stays pending for out-of-band supply (challenge-response / human), as today. Most signups need
  no stored secret (open form / OAuth-you-create) and apply with inputs + URL alone.
- **The boundary is unchanged:** the adapter executes nothing outbound itself and never drives a
  browser. It provides the package + the gates; the agent does the doing and reports back.

## Capabilities

### New Capabilities

- `live-application`: turn the simulated pipeline into a real one by handing the connected agent a
  complete application package (API or web) and folding its reported result back through verification
  — with danger-tiered credential delivery — the agent executes, the server supplies + gates.

## Impact

- **Affected specs:** `live-application` (new); supersedes the `SIMULATED` behavior in
  `application-pipeline` and broadens `web-handoff`'s package to all flows. Builds on
  `autonomy-switch`, `credential-vault`, `maker-profile`.
- **Affected code:** `operations/handoff.ts` — the package builder gains optional danger-tiered
  credential inclusion (needs `VaultCrypto` to open a secret); `operations/execute.ts` —
  `submit_step` returns the package at submission, consumes a `result` at verification, real audit;
  `get_handoff` broadened to the general application-package op; thread `VaultCrypto` into
  `registerExecuteOperations`; `app.ts` wiring. The local + stateful entries already have the vault.
- **Non-goals / tracked follow-up:** the server making provider calls itself (explicitly **not** —
  the agent does); a built-in browser (never — the agent brings it); auto-asserting eligibility
  (never); provider-specific request shaping beyond what the Flow Document declares.
