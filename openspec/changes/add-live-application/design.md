# Design — live-application (#91)

## Context

`submit_step` walks `eligibility → assemble → submission → verification → redeem`, one stage per
call, under the autonomy switch + confirmation tokens + danger gating, assembling inputs from the
maker profile. The action stages are stubbed (`"SIMULATED …"`). `buildHandoff(flow, execution,
profile)` (`operations/handoff.ts`) already produces a generic, secret-free **application package**:
`action_url`, `method`, `instructions`, `assembled_inputs`, `pending_inputs` (credential fields
marked, value never included), `danger_level`, `gaps`, `eligibility_notice`. `get_handoff` returns
it. The vault (`VaultCrypto`) decrypts credentials but is **not** currently wired into the execute
ops.

## Decisions

- **Reuse the package; don't invent a new shape.** The handoff package is already the "everything you
  need to apply" artifact and is web/API-agnostic. `submit_step` at submission returns it (for API
  flows as the action to perform; for web flows as the browser handoff). `get_handoff` stays as the
  fetch-anytime accessor over the same builder.
- **The agent executes and reports back.** Submission returns the package and advances to
  `verification` with status `running` (awaiting the agent). The agent performs the call/automation
  with its own tools, then calls `submit_step` again with a **`result`** object
  (`{ ok: boolean, detail?, data? }`). Verification records that real result; redeem reflects it. No
  server-side provider call, ever.
- **Danger-tiered credential delivery.** The package builder takes optional `(vault, credentialId,
  dangerLevel)`. When a credential is requested AND `dangerLevel ≤ 2`, open it (`vault.open`) and put
  the plaintext on that input as an `assembled` credential (so the agent can authenticate); audit the
  **real** use. When `dangerLevel ≥ 3`, never open it — keep it `pending` (out-of-band), exactly as
  today. No credential requested → unchanged (open form / OAuth-you-create needs no secret).
- **VaultCrypto into the pipeline.** Thread the optional `VaultCrypto` through
  `registerExecuteOperations` (and `buildRouter` already has it). Absent a vault (no key), credentials
  stay pending regardless of danger — fail safe.
- **Language + labels.** Drop "SIMULATED" from descriptions, `did` strings, and the audit; the op
  `returns` notes the agent-executes model. `submit_step`'s description states submission hands the
  agent a package to perform and report back.
- **Eligibility unchanged.** Still surfaced, never auto-asserted/denied; danger ≥ 3 still routes
  through the out-of-band challenge (existing `decision === "stop"` path).

## Shape

```ts
// handoff.ts — package builder gains optional danger-tiered credential inclusion
export async function buildApplicationPackage(
  flow, execution, profile?,
  opts?: { vault?: VaultCrypto; credential?: VaultEntry; }   // include secret only when danger ≤ 2
): Promise<HandoffPackage>                                    // a credential input moves pending → assembled

// execute.ts — submit_step
//   submission: return { application_package }, stage → verification (running)
//   verification: read params.result → record real outcome, stage → redeem
//   registerExecuteOperations(router, data, flows, store, profileStore?, vault?)
```

`result` param on `submit_step`: `{ type: object, required: false }` — present at the verification
stage; its `ok`/`detail`/`data` become the recorded outcome (absent → "awaiting the agent's result").

## Why not

- **Server makes the HTTP call** — rejected (the whole point of #91's correction): the agent executes
  with its own tools; the server provides + gates.
- **A separate `api_action` op distinct from `get_handoff`** — rejected: same package, two flow
  shapes; one builder, one accessor, returned inline at submission.
- **Always include the credential** — rejected: danger ≥ 3 (payment / identity) must never expose a
  secret to the agent/LLM; tiering matches the existing danger model.
