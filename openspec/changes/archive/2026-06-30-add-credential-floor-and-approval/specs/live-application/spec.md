## MODIFIED Requirements

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
