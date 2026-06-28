# Tasks — Profile + credential vault (#19 + #34)

> **Scope:** per-user persistent maker profile as a CRUDE entity (#34) + an encrypted,
> non-payment credential vault (#19), behind a `ProfileStore` seam (local-only over stdio;
> per-user Durable Object hosted). Reuses the autonomy switch + confirmation tokens for
> per-action approval. **The core stores no payment credentials and drives no payment steps
> (a scope boundary, not enforcement against externally composed tools); the agent never sees
> a plaintext secret.** Real submission/injection, real Challenge-Response codes, payment, and
> the web-only handoff (#21) are **out of scope**.
>
> **Definition of done:** all tasks `[x]`, `openspec validate add-profile-vault --strict`
> passes, typecheck/build/lint/tests green, CRUDE works end to end over stdio (local mode)
> and on the dev worker (per-user, OAuth-gated), payment is refused, no plaintext secret is
> ever returned, and the live endpoint stays untouched. One commit per section, closing its
> issue.

## 1. CRUDE categories + `ProfileStore` seam + maker profile (local mode) — #49

- [x] 1.1 `SemanticCategory` += `CREATE | UPDATE | DELETE` (`core/router.ts`); `mcp.ts`
  registers `mcp_aql_create` / `mcp_aql_update` / `mcp_aql_delete`, each gated on an op of
  that category (mirroring `mcp_aql_execute`)
- [x] 1.2 `session/profile.ts`: `MakerProfile` + `UserRecord` types, **keyless** `ProfileStore`
  interface (bound to one user by construction), and an in-memory/local `ProfileStore` — data
  on-device, never transmitted
- [x] 1.3 `operations/profile.ts`: `create_profile` / `get_profile` / `update_profile` /
  `add_project` / `remove_project` / `delete_profile` with the right semantic categories;
  registered in `app.ts` only when a `ProfileStore` is provided; wired into the local stdio
  entry (`index.ts`)
- [x] 1.4 Unit tests (`test/profile.test.mjs`): CRUDE round-trip over the local store; per-user
  isolation; tool gating (create/update/delete tools appear only with the ops); category
  mapping; validation errors. Updated `transports.test.mjs` (local surface now 5 tools / 18
  ops). 83 green

## 2. Credential vault — encrypted, payment-refusing, metadata-only reads + audit log — #50

- [x] 2.1 `VaultEntry` + `SecretKind` (`scoped_token | password | identity_document`; **no
  `payment`**); AES-GCM seal/open via pure Web Crypto (`session/vault.ts`, Workers-safe). Local
  key is a generated keyfile under `~/.makerperks/vault.key` (0600 in a 0700 dir;
  `MAKERPERKS_VAULT_DIR` overrides) loaded by node-only `src/local/vault-key.ts`; hosted
  `VAULT_KEY` is §3. (`VAULT_KEY`/keyfile decision: Mick, 2026-06-28.)
- [x] 2.2 `add_credential` (CREATE, **`payment` not in the enum → rejected**), `list_credentials`
  (READ, **metadata only — never ciphertext/plaintext**), `remove_credential` (DELETE). Registered
  only when a ProfileStore **and** a VaultCrypto are wired
- [x] 2.3 `AuditEntry` + append-only per-user audit (capped `AUDIT_CAP`); all profile/vault
  mutations recorded; `get_profile` `include_audit` returns the log (metadata only). Secret-*use*
  auditing lands with the pipeline in §4
- [x] 2.4 Tests (`test/vault.test.mjs`): seal/open round-trip + fresh IV; payment refused +
  nothing stored; `add_credential`/`list_credentials` never leak plaintext/ciphertext/iv; audit
  appended (no secret values); keyfile 0600 + persists + reopens. 92 green

## 3. Hosted per-user Durable Object + OAuth gating — #51

- [x] 3.1 Per-user Durable Object `MakerProfileDO` (`src/durable-profile.ts`, `idFromName(userId)`)
  with an RPC `get/set/deleteRecord` surface over its `storage`; bound as `PROFILE_OBJECT` +
  migration `v2` in `wrangler.dev.jsonc`; `VAULT_KEY` secret documented
- [x] 3.2 `worker-stateful.ts` builds a `ProfileStore` (delegating to the user's DO stub) + a
  `VaultCrypto` (from `VAULT_KEY`) bound to `this.props.userId`, so a session can only ever
  read/write its own user's record; no userId → surface not registered; live worker untouched.
  Typechecks + builds; 92 tests green
- [ ] 3.3 Deploy: `wrangler secret put VAULT_KEY -c wrangler.dev.jsonc`, `npm run deploy:dev`;
  verify two users get isolated records + unauthenticated has no profile access, from Claude
  Desktop against `makerperks-dev.mcpaql.com`

## 4. Pipeline integration (assemble from profile; gated, audited secret-use) — #52

- [ ] 4.1 `assemble` merges profile-derived defaults under per-call `inputs` (explicit wins);
  `missing_inputs` reflects only what the profile lacks
- [ ] 4.2 `submission` may reference a vault entry by `id`; use is **simulated** ("would
  inject <label>"), gated by the autonomy switch + confirmation token, and audited; eligibility
  still never auto-asserted
- [ ] 4.3 Tests: assemble fills from profile; secret-use is gated + audited + never returns
  plaintext; danger ≥ 3 still stops

## 5. Validate + archive — #53

- [ ] 5.1 `openspec validate add-profile-vault --strict`; typecheck/build/lint/tests green
- [ ] 5.2 Archive into `openspec/specs/` (`maker-profile`, `credential-vault`, and the
  `application-pipeline` delta)
