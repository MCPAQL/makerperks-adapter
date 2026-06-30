# Tasks — Credential floor + honest approval gate (#95, #96)

> **Scope:** kind-tier credential exposure (scoped_token only), no auto-accept for credential
> flows, floor the autonomy gate for credential use, and reframe the human gate honestly (host
> tool-permission prompt primary; confirmation token a host-independent fallback). The `action_url`
> allowlist (#97) and a real out-of-band challenge channel are **out of scope**.
>
> **Definition of done:** all tasks `[x]`; `openspec validate add-credential-floor-and-approval
> --strict` passes; typecheck/lint/tests green; specs match code.

## 1. Kind-tiered credential exposure (#95-A)

- [x] 1.1 `handoff.ts buildApplicationPackage`: expose only `credential.kind === "scoped_token"` at
  danger ≤ 2; password / identity_document always pending
- [x] 1.2 Tests: a non-scoped_token credential is never auto-exposed at danger ≤ 2

## 2. No auto-accept for credential flows (#95-B)

- [x] 2.1 `flow-acceptance.ts`: `hasCredentialInput` + `autoAccepts` refuses any credential-bearing
  candidate in every mode
- [x] 2.2 Test: a ready danger-0 credential flow stays pending under full_auto

## 3. Autonomy floor for credential use + honest gate (#95-C, #96)

- [x] 3.1 `execute.ts`: `CREDENTIAL_DANGER_FLOOR = 2`; floor `gateDanger` for a credential-using
  submission; honest `human_gate`/`reason` (no false "out-of-band challenge required")
- [x] 3.2 Test: a credential-using submission floors to pause under auto_low_risk

## 4. Docs + specs

- [x] 4.1 `docs/INSTALL.md` + `README.md`: host-config note — gate the mutating endpoints
  (`mcp_aql_create/update/delete/execute`); READ is the auto-approvable surface
- [x] 4.2 MODIFIED deltas: `live-application`, `flow-acceptance`, `application-pipeline`
