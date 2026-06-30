# Tasks — Credential-bind the token + check the served flow (PR #102 review)

> **Definition of done:** all tasks `[x]`; `openspec validate fix-credential-binding-and-inherited-inputs
> --strict` passes; tests green; specs match code.

## 1. Bind the token to the credential id (P1)

- [x] 1.1 `state.ts`: add `ConfirmationToken.credentialId?`
- [x] 1.2 `execute.ts`: set it on mint; reject on resume when the supplied `credential_id` differs
- [x] 1.3 Test: a token issued for credential A is rejected when replayed with credential B

## 2. Evaluate the served flow for auto-accept (P2)

- [x] 2.1 `flow-acceptance.ts`: `hasCredentialInput` over `mergeFlow(deriveFlow(program), candidate)`
- [x] 2.2 Test: a candidate that inherits a baseline credential input never auto-accepts under full_auto
