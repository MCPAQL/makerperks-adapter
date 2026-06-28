# credential-vault Specification

## Purpose
TBD - created by archiving change add-profile-vault. Update Purpose after archive.
## Requirements
### Requirement: Encrypted-at-rest credential vault

The adapter SHALL provide a per-user credential vault storing secrets of kind
`scoped_token`, `password`, or `identity_document`. Every secret SHALL be encrypted at rest
with AES-GCM (Web Crypto), using a key provisioned out of band (a `VAULT_KEY` worker secret
hosted; a local key in local mode) and a fresh random IV per entry. Operations:
`add_credential` (CREATE), `list_credentials` (READ), `remove_credential` (DELETE).

#### Scenario: A stored secret is encrypted and recoverable server-side

- **WHEN** `add_credential` stores a `scoped_token`
- **THEN** the persisted entry holds AES-GCM ciphertext (not the plaintext), and the server can
  decrypt it for use

### Requirement: Plaintext secrets are never returned to the agent

`list_credentials` and any other read SHALL return only secret **metadata** (`id`, `kind`,
`label`, `provider`, `createdAt`) — never the ciphertext and never the plaintext. A secret's
plaintext SHALL be decrypted only server-side at the point of (simulated) use, and SHALL NOT
be surfaced in any operation result.

#### Scenario: Listing credentials leaks nothing secret

- **WHEN** `list_credentials` is called
- **THEN** each entry includes its metadata and contains neither the plaintext nor the
  ciphertext of the secret

### Requirement: Payment is out of scope for the core server

The core server SHALL NOT store payment credentials and SHALL NOT drive payment steps.
`add_credential` SHALL accept only `scoped_token`, `password`, and `identity_document`; a
`payment` kind (or a payment-categorized credential) SHALL be rejected with a validation error.
Together with the pipeline's `danger >= 3` stop, this bounds the core's own surface so it
neither stores nor auto-submits a payment. This is a scope boundary on this server, NOT
enforcement against externally composed tools — the adapter does not undertake to prevent a
separately configured payment agent or tool from operating alongside it.

#### Scenario: Payment is rejected

- **WHEN** `add_credential` is called with kind `payment`
- **THEN** it returns a validation error and stores nothing

### Requirement: Per-action approval and audit log

Using a stored secret in the application pipeline SHALL be gated by the autonomy switch and a
single-use, param-bound confirmation token (per-action approval). Every profile/vault mutation
and every secret *use* SHALL append an entry to a per-user, append-only audit log; reading the
audit log SHALL return metadata only (no secret values).

#### Scenario: A secret use is gated and audited

- **WHEN** the pipeline references a vault secret at the submission stage
- **THEN** the step is gated like any risky step (confirmation token under the autonomy mode),
  the use is recorded in the audit log, and no plaintext is returned

