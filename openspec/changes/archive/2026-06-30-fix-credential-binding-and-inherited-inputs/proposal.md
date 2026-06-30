## Why

Review of the credential-floor work (#95/#96, PR #102) found two real gaps the prior specs left
implicit:

- **The confirmation token was not bound to the credential id.** It was param-bound to the
  execution, stage, and inputs only — so an approval issued for credential A could be replayed with
  a different `credential_id` (same inputs) and still validate, letting the later lookup open a
  different stored secret. Bounded (same user's vault, only `scoped_token` exposes) but the approval
  wasn't pinned to *which* secret.
- **The no-auto-accept check inspected the candidate overlay only.** A candidate that omits
  `required_inputs` still inherits the derived baseline's credential input when served (e.g. a
  student-audience program derives `student_verification` with `source: "credential"`), so a
  credential-bearing flow could auto-accept under `full_auto` without review.

## What Changes

- The confirmation token is **also bound to the credential id**; a replay with a different
  `credential_id` is rejected.
- The credential-bearing-flow auto-accept check is evaluated on the **effective served flow** (the
  overlay merged over the derived baseline), so an inherited credential input counts.

## Capabilities

### Modified Capabilities

- `application-pipeline`: the confirmation token's param-binding includes the credential id.
- `flow-acceptance`: the credential-input gate is evaluated on the effective served (merged) flow.

## Impact

- **Affected specs:** `application-pipeline`, `flow-acceptance` (MODIFIED).
- **Affected code:** `src/session/state.ts` (`ConfirmationToken.credentialId`), `src/operations/
  execute.ts` (bind + verify on resume), `src/operations/flow-acceptance.ts` (`hasCredentialInput`
  over `mergeFlow(deriveFlow(program), candidate)`).
