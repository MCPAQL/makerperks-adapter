# Design — Profile + credential vault (#19 + #34)

Per-**user** persistent state the protocol does not provide, behind a DI seam that mirrors
the per-**session** `SessionStore`. Local-only over stdio; a per-user Durable Object hosted.
Security designed in: the agent never sees a plaintext secret, payment is unstorable, every
change and use is audited.

## Decisions

### 1. A `ProfileStore` seam, separate from `SessionStore`, keyed by user

Two lifetimes, deliberately kept apart:

| | lifetime | key | backing |
|---|---|---|---|
| `SessionState` (tokens, executions, autonomy) | per-session, ephemeral | session | DO-per-session (built) |
| `MakerProfile` + vault + audit | per-user, persistent | `userId` | DO-per-user (this change) |

```ts
interface ProfileStore {            // keyless — bound to ONE user by construction
  get(): Promise<UserRecord | undefined>;
  set(record: UserRecord): Promise<void>;
  delete(): Promise<void>;
}
interface UserRecord { profile?: MakerProfile; vault: VaultEntry[]; audit: AuditEntry[]; }
```

The store takes **no `userId` argument** — exactly like `SessionStore.get()/set()` take no
session id. It is constructed already scoped to one user, so per-user isolation is guaranteed
*by construction* (you cannot ask a store for another user's record), mirroring how one
DO-per-session gives per-session isolation.

- **Local-only mode (#34):** an in-memory `ProfileStore` over stdio, the single local user.
  The data never leaves the machine — this is the private personal management tool. Pure and
  runtime-free, so it is fully unit-testable off Workers. (Cross-restart file persistence is a
  tracked refinement; in-memory already satisfies the never-leaves-the-machine property.)
- **Hosted:** a **per-user Durable Object** addressed by `idFromName(userId)`, where `userId`
  comes from `this.props.userId` (the GitHub-authenticated identity already carried into the
  session DO). The worker constructs that user's `ProfileStore` bound to their DO. One DO per
  user gives strong isolation, transactional `storage`, and read-after-write consistency (KV's
  eventual consistency would let a just-edited profile read stale). It is the natural home for
  the profile, the encrypted vault, and the audit log.
- CRUDE ops bind to the store the same way EXECUTE ops bind to `SessionStore`; the live
  READ-only worker provides neither, so neither surface is registered there.

### 2. CRUDE categories + gated tools

`SemanticCategory` gains `CREATE | UPDATE | DELETE` (the `// later (#34–#36)` marker is now
realized). `mcp.ts` exposes `mcp_aql_create` / `mcp_aql_update` / `mcp_aql_delete`, each
**registered only when the router has an op of that category** — identical gating to
`mcp_aql_execute`. So the live worker still shows just `mcp_aql_read`, and the dev worker
shows the full CRUDE surface. The demo beat: one server, READ over the public directory and
full CRUDE over your own profile — the shape DollhouseMCP models.

Op → category: `create_profile` = CREATE; `get_profile` / `list_credentials` = READ;
`update_profile` / `add_project` / `remove_project` = UPDATE; `delete_profile` /
`remove_credential` = DELETE; `add_credential` = CREATE.

### 3. The profile is non-secret; the vault is secret and never readable as plaintext

```ts
interface MakerProfile {
  identity: { name?: string; email?: string;
    location?: { region?: string; country?: string };
    links?: { label: string; url: string }[] };
  projects: { id: string; name: string; description?: string; url?: string;
    role?: string; tags?: string[] }[];
  createdAt: number; updatedAt: number;
}
```

The profile holds only non-secret, application-assembly fields (name, contact, region,
public links, project descriptions). It is freely readable by the agent — that is what the
`assemble` stage needs.

**The vault is the opposite.** Its cardinal rule: **a plaintext secret is never returned to
the agent.** This preserves the whole point of MCP-AQL Challenge-Response (the LLM cannot see
the secret). `list_credentials` returns **metadata only** (`id`, `kind`, `label`, `provider`,
`createdAt`) — never ciphertext or plaintext. A secret's plaintext is decrypted only
server-side, inside the (simulated) submission, and even then its use is recorded as
"would inject <label>", not the value.

```ts
type SecretKind = "scoped_token" | "password" | "identity_document";
// "payment" is intentionally absent — see decision 5.
interface VaultEntry {
  id: string; kind: SecretKind; label: string; provider?: string;
  ciphertext: string; iv: string; createdAt: number; // AES-GCM, base64
}
```

### 4. Encryption at rest via Web Crypto AES-GCM

Each secret is sealed with **AES-GCM** (Web Crypto, available on Workers and Node 20). The
key is a 256-bit symmetric key: a Worker **secret** `VAULT_KEY` hosted; a local keyfile (or
env) in local mode. A fresh random `iv` per entry; `ciphertext`/`iv` stored base64. DO
storage is already encrypted at rest by Cloudflare — this is defense in depth so a secret is
unreadable even given raw storage access, and it keeps the local-mode file encrypted too.
No password-based KDF in scope; the symmetric key is provisioned out of band.

### 5. Payment is out of scope for the core — a boundary, not a system-wide block

Per Mick: store passwords and identity documents, but **keep payment out of the core server**
so it never stores payment credentials and never drives a payment step. Two guards within our
scope:

1. **The vault refuses payment.** `add_credential` accepts only `scoped_token` / `password` /
   `identity_document`; a `payment` kind (or a payment-categorized field) is rejected with a
   typed validation error. There is simply nowhere in our store to put a payment credential.
2. **The pipeline drives no payment step.** `danger ≥ 3` (payment / real identity) `stop`s for
   out-of-band Challenge-Response in every autonomy mode (unchanged from #18) — the core never
   auto-submits one.

This is a **scope decision, not active enforcement against the wider system.** If an operator
has separately wired up their own payment agent or tool to run alongside this server, that is
their composition and we do not proactively shut it down — we simply do not support or
participate in payment as part of the core. The two guards above bound *our* surface; they
make no claim about tools we don't control.

### 6. Per-action approval + audit log

Using a vault secret in the pipeline is gated exactly like any other risky step — the
autonomy switch + a single-use, param-bound confirmation token (the `submission` halt already
built in #17/#18). Reading or mutating the profile/vault and *using* a secret each append an
`AuditEntry { at, action, userId, detail }` to the per-user record. The audit log is
append-only and per-user (lives in the same DO), readable by its owner via `get_profile`'s
`include_audit` flag — metadata only, no secret values.

### 7. Pipeline integration is additive and still simulated

`assemble` merges profile-derived defaults under any per-call `inputs` (explicit call inputs
win), so `missing_inputs` shrinks to what the profile genuinely lacks. `submission` may
reference a vault entry by `id`; the use is **simulated** ("would inject <label>"), gated, and
audited — consistent with #17's fully-simulated pipeline. Eligibility is still the maker's to
assert and is never auto-asserted.

## Out of scope (tracked)

Real provider submission / real secret injection; real out-of-band Challenge-Response codes;
**payment of any kind**; the web-only handoff (#21); the service queue (#35) / maintenance
(#36); a password-based KDF or per-user key rotation.
