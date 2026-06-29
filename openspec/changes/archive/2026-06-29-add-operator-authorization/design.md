# Design — operator-authorization (#84 / #90)

## Context

The stateful worker authenticates each session via GitHub OAuth and carries `UserProps`
(`{ userId, login }`) into the session DO (`worker-stateful.ts`). The GitHub access token is used
**transiently at the callback** (`fetchGitHubIdentity` in `auth/github.ts`) to read `/user`, then
discarded — no token at rest. `proposer: userId` already flows into `buildRouter`. The acceptance
ops (`accept_flow`, `set_acceptance_mode`) are currently callable by any authenticated user.

## The invariant (the spine)

> The server never initiates a state-changing outbound call. Every mutation is initiated by an
> authenticated principal under their own authority; the only outbound calls the server makes are
> reads.

Everything below serves this: operator status is a **read** (or pure allowlist match); acceptance
is a principal's action; the PR (#87) is the operator's own `gh`. The server holds **no GitHub
write credential**, ever.

## Decisions

- **Resolve operator status at the OAuth callback, persist only a boolean.** The token is already in
  hand there for the identity fetch, so option A's `GET /repos/{owner}/{repo}` permission read costs
  one extra call at login — and only `isOperator: boolean` enters `UserProps`. No token is stored,
  and there is no per-request permission read (one per session). Local/stdio has no callback → the
  resolver returns `true` (implicit operator on one's own machine).
- **A and B, host picks; fail safe.** `OperatorPolicy` is derived from config:
  - `OPERATOR_REPO` set → **A**: operator ⇔ `permissions.admin` on that repo for the user's token.
  - `OPERATOR_LOGINS` set → **B**: operator ⇔ `login ∈` the comma-separated list. Zero outbound.
  - both set → A and B are OR'd (admin **or** listed).
  - neither set, hosted → **fail safe**: `isOperator` is always `false` (nothing can be accepted).
  - local/stdio → implicit `true`.
- **Option A costs scope; B does not.** Reading a repo's `permissions` needs `public_repo`/`repo`
  (or `read:org` for an org-role variant), broader than today's `read:user`. `githubAuthorizeUrl`
  bumps the scope **only when `OPERATOR_REPO` is set**, so a B-only or allowlist host keeps the
  minimal scope. This is the honest trade: A = no list to maintain, broader scope for everyone;
  B = minimal scope, a list to maintain.
- **Gate at the op, not the transport.** `registerFlowAcceptanceOperations` receives an
  `operator: boolean` (resolved from the session); `accept_flow` and `set_acceptance_mode` return a
  new `FORBIDDEN` wire error when it is false. The `ErrorCode` union (`core/wire.ts`) gains
  `FORBIDDEN` ("authenticated principal lacks authority for this operation" — distinct from a
  missing/expired auth, which the transport already rejects).
  `propose_flow`, `list_proposed_flows`, `update_proposed_flow`, `reject_flow`, and all discovery /
  READ ops stay open. (`reject_flow` and `update_proposed_flow` operate on the *queue*, not the
  served set — keep them open for now; revisit under #73 if queue-spam becomes an issue.)
- **One resolver, three call sites.** `session/operator.ts` exports `resolveOperator(policy, ctx)`
  used by (1) the callback (with the token, option A), (2) the allowlist match (B), (3) the local
  default (true). The boolean it produces is the only thing the router sees.

## Shape

```ts
// session/operator.ts
export type OperatorPolicy =
  | { kind: "repo"; owner: string; repo: string }      // A
  | { kind: "allowlist"; logins: string[] }            // B
  | { kind: "both"; owner: string; repo: string; logins: string[] }
  | { kind: "implicit" }                               // local/stdio
  | { kind: "closed" };                                // hosted, neither configured -> fail safe
export function operatorPolicy(env): OperatorPolicy           // parse config
export async function resolveOperator(                        // at callback / session build
  policy, { login, token, fetchImpl }
): Promise<boolean>
```

`auth/github.ts` gains `fetchRepoAdmin(owner, repo, token, fetchImpl?)` → `boolean` (a read).
`AppOptions`/`buildRouter` gain `operator?: boolean`; `registerFlowAcceptanceOperations(..., operator)`.

## Why not

- **Store the user's token in the session DO** and check permission lazily — rejected: a credential
  at rest, and a per-request read. Resolving the boolean at the callback avoids both.
- **Server-side PR / a host GitHub write token** — rejected by the invariant; that is the whole
  point of the steer. The operator runs export + their own `gh` (#87).
- **A MODIFIED delta on `flow-acceptance`** — kept the gating as a requirement of this new
  capability that *references* the acceptance ops, so `flow-acceptance`'s archived spec stays the
  definition of the ops and this stays the trust boundary over them.
