## Why

Stage 1 (#19 + #34). The application pipeline (#17) gathers `inputs` **per call** in
`submit_step` — nothing persists between sessions, so a maker re-supplies the same identity
and project facts every time, and there is no home for the credentials an application needs.
MCP-AQL gives us session-scoped confirmation tokens, **not** per-user storage. This change
adds that storage: a **maker profile** the pipeline assembles applications from, exposed as a
first-class **CRUDE** entity (#34), plus an encrypted **credential vault** (#19) — both keyed
by the authenticated user, with a fully **local-only** deployment where the data never leaves
the machine.

The security posture is designed in from the start: no plaintext secret is ever returned to
the agent, **payment is out of scope for the core server** — it stores no payment credentials
and drives no payment steps — and every mutation and secret-use is audited. This is a scope
boundary, not a system-wide block: if an operator composes their own payment tooling alongside
this server, that is their setup and we do not proactively prevent it; we simply do not support
payment as part of the core.

## What Changes

- **CRUDE surface (#34):** add `CREATE` / `UPDATE` / `DELETE` to `SemanticCategory` and the
  matching `mcp_aql_create` / `mcp_aql_update` / `mcp_aql_delete` tools in `mcp.ts`, each
  **gated on the presence of ops in that category** — exactly how `mcp_aql_execute` is gated
  today. The live READ-only worker is unaffected (no such ops registered).
- **`ProfileStore` DI seam** — a per-**user** store mirroring the per-**session**
  `SessionStore`: `get(userId)` / `set(userId, profile)` / `delete(userId)`. In-memory/local
  over stdio (the **local-only personal-tool mode**, data on-device); a **per-user Durable
  Object** (`idFromName(userId)`) on the dev worker, gated by `this.props.userId`.
- **Maker profile entity** (`MakerProfile`: identity + projects) with CRUDE ops:
  `create_profile`, `get_profile` (READ), `update_profile`, `add_project`, `remove_project`,
  `delete_profile`.
- **Credential vault** — encrypted-at-rest (Web Crypto **AES-GCM**) storage for
  `scoped_token` / `password` / `identity_document` secrets. **`payment` is not a storable
  kind — the vault refuses it.** Vault reads return **metadata only, never plaintext**; the
  plaintext is used only server-side inside the (simulated) submission. Ops: `add_credential`
  (CREATE), `list_credentials` (READ, metadata), `remove_credential` (DELETE).
- **Per-user audit log** — append-only record of every profile/vault mutation and every
  secret *use*, stored in the per-user DO.
- **Pipeline integration** — the `assemble` stage fills `required_inputs` from the profile
  (the maker stops re-typing them); using a vault secret at `submission` is **simulated**,
  gated by the autonomy switch + a confirmation token, and audited. Eligibility is still
  never auto-asserted.

## Capabilities

### New Capabilities

- `maker-profile`: a first-class CRUDE maker profile (identity + projects), per-user, with a
  local-only mode where the data never leaves the machine, that the application pipeline
  assembles from.
- `credential-vault`: an encrypted-at-rest per-user vault for non-payment secrets, returning
  metadata only, refusing payment credentials, with per-action approval and an audit log.

## Impact

- **Affected specs:** `maker-profile` (new), `credential-vault` (new), `application-pipeline`
  (MODIFIED — `assemble` reads the profile).
- **Affected code:** `core/router.ts` (`SemanticCategory` += CREATE/UPDATE/DELETE); `mcp.ts`
  (three new gated tools); new `session/profile.ts` (`MakerProfile`, `VaultEntry`,
  `ProfileStore`, crypto, audit); new `operations/profile.ts` (CRUDE ops); `app.ts`
  (register when a `ProfileStore` is provided); `operations/execute.ts` (`assemble` pulls
  from the profile; gated, audited secret-use at `submission`); `worker-stateful.ts` (per-user
  DO + `VAULT_KEY` secret + `this.props`-gated `ProfileStore`). The live stateless worker and
  the READ surface are unchanged.
- **Security invariants:** no plaintext secret ever leaves the server to the agent; the core
  stores no payment credentials (the vault refuses them) and drives no payment steps (danger
  ≥ 3 still `stop`s, challenge-response) — a scope boundary, not a guarantee about externally
  composed tools; per-user isolation via the DO key; encryption at rest via AES-GCM.
- **Non-goals / tracked follow-up:** real (non-simulated) provider submission and real secret
  injection; real out-of-band Challenge-Response codes; payment support of any kind; the
  web-only handoff (#21); the service-submission queue (#35) and maintenance (#36).
