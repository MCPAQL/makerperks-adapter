# Tasks — live-application (#91)

> **Scope:** make the application pipeline real — `submit_step` hands the connected agent a complete
> application package (API or web) instead of simulating, consumes the agent's reported result for
> real verification/redeem, and delivers credentials danger-tiered (≤2 included, ≥3 out-of-band). The
> agent executes with its own tools; the server provides + gates and never makes the call or drives a
> browser. Provider-specific request shaping beyond the Flow Document, and the server executing
> anything outbound, are **out of scope**.
>
> **Definition of done:** all tasks `[x]`; `openspec validate add-live-application --strict` passes;
> typecheck/lint/both test layers green; no `SIMULATED` remains in the submission/verification/redeem
> path; `submit_step` returns the package at submission and records the agent's `result` at
> verification; a danger ≤2 credential is included, a danger ≥3 credential is never exposed; the
> existing autonomy/confirmation/danger/audit behavior is unchanged. One commit per section, closing
> #91 on the last; push on `main` as each section completes.

## 1. The application package + danger-tiered credentials

- [x] 1.1 `operations/handoff.ts`: add danger-tiered credential inclusion to the package builder —
  when a credential is supplied/needed and `danger_level ≤ 2`, open it (`VaultCrypto.open`) and move
  that input from `pending` to `assembled` (kind `credential`); `danger ≥ 3` (or no vault) keeps it
  pending/out-of-band. Secret-free otherwise, unchanged.
- [x] 1.2 Thread optional `VaultCrypto` into `registerExecuteOperations` + `buildRouter` wiring
  (`app.ts`); local + stateful entries already construct the vault.
- [x] 1.3 Tests: a danger ≤2 credential is opened into `assembled_inputs`; a danger ≥3 credential
  stays `pending` (never opened); no-vault keeps it pending; no-credential flows unchanged.

## 2. submit_step drives a real application

- [ ] 2.1 `submit_step` **submission** stage: return the `application_package` (no `"SIMULATED"`);
  advance to `verification` (running). Keep the confirmation/danger halt path unchanged.
- [ ] 2.2 `submit_step` **verification** stage: read a `result` param (`{ ok, detail?, data? }`) and
  record it as the real outcome (absent → "awaiting the agent's result"); **redeem** reflects it.
  Real audit (drop "simulated, not decrypted" / "SIMULATED").
- [ ] 2.3 Broaden `get_handoff` to the general application-package accessor (both flow shapes); update
  `submit_step` / op descriptions to the agent-executes model (no "SIMULATED").
- [ ] 2.4 Tests: submission returns the package + advances to verification; verification records a
  reported `result`; a web flow still gets its handoff; danger ≥3 still halts for the out-of-band
  challenge; the full happy path completes with real (non-simulated) log + audit.

## 3. Validate + archive

- [ ] 3.1 `openspec validate add-live-application --strict`; typecheck/lint/both test layers green;
  update any op-count/parity assertions if touched.
- [ ] 3.2 Archive into `openspec/specs/` (`live-application` created); fill the spec `Purpose`.
