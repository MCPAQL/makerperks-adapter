# Tasks — operator-authorization (#84 / #90)

> **Scope:** the zero-trust trust boundary — untrusted users propose; a configured operator
> (GitHub-admin-on-a-governing-repo **or** a static login allowlist; local user implicit; fail-safe
> when neither is set) is the only principal that may accept into the canonical served set — under
> the invariant that the server never initiates a state-changing outbound call. The durable-canonical
> mirror + operator-run export-to-PR (#87), anti-griefing limits (#73), and any server-held GitHub
> **write** credential are **out of scope**.
>
> **Definition of done:** all tasks `[x]`; `openspec validate add-operator-authorization --strict`
> passes; typecheck/lint/both test layers green; a non-operator is refused `accept_flow` /
> `set_acceptance_mode` with `FORBIDDEN` while `propose_flow` + READ stay open; A (repo-admin), B
> (allowlist), local-implicit, and neither-configured-fail-safe are all unit-tested; the operator
> permission read uses the user's own token at the callback and stores only a boolean. One commit per
> section, closing its issue; push on `main` as each section completes.

## 1. Operator policy + resolver + the FORBIDDEN code

- [x] 1.1 `core/wire.ts`: add `FORBIDDEN` to the `ErrorCode` union (authenticated principal lacks
  authority).
- [x] 1.2 `session/operator.ts`: `OperatorPolicy` (`repo` / `allowlist` / `both` / `implicit` /
  `closed`), `operatorPolicy(env)` parsing `OPERATOR_REPO` + `OPERATOR_LOGINS`, and
  `resolveOperator(policy, { login, token, fetchImpl })` → boolean (A = repo admin via the user's
  token; B = login ∈ list; both = OR; implicit = true; closed = false). Plus `policyNeedsRepoScope`.
- [x] 1.3 `auth/github.ts`: `fetchRepoAdmin(owner, repo, token, fetchImpl?)` → boolean — a read of
  `GET /repos/{owner}/{repo}` returning `permissions.admin === true`; `false` on any failure.
  `githubAuthorizeUrl` takes an optional `scope`, requested broader (`public_repo`) only when a repo
  policy is active; otherwise keeps `read:user`.
- [x] 1.4 Tests: policy parsing for each config combination; `resolveOperator` for A (admin true /
  non-admin false via an injected fetch), B (hit/miss), both (OR), implicit (true), closed (false).

## 2. Gate the acceptance ops

- [x] 2.1 Thread `operator?: boolean` through `AppOptions` + `RouterStores` + `buildRouter` into
  `registerFlowAcceptanceOperations(router, data, flows, registry, proposer?, store?, operator?)`.
- [x] 2.2 In `accept_flow` and `set_acceptance_mode`, return `FORBIDDEN` when `operator` is not true;
  leave `propose_flow`, `list_proposed_flows`, `update_proposed_flow`, `reject_flow`, and all READ /
  discovery ops open. Default `operator` to `false` (fail safe); the dial stays the operator's
  pre-authorization (a non-operator's proposal still auto-accepts under an operator-set mode).
- [x] 2.3 `worker-stateful.ts`: resolve the operator boolean at the OAuth callback (reusing the
  token already fetched for identity — `fetchGitHubIdentity` now returns the transient `accessToken`),
  carry `isOperator` in `UserProps`, pass it into `buildRouter` as `operator`, and bump the authorize
  scope only when option A is active. (Local/stdio wires no registry, so there is no op to gate.)
- [x] 2.4 Tests: a non-operator session is refused `accept_flow` + `set_acceptance_mode`
  (`FORBIDDEN`) but can `propose_flow` and read; an operator accepts a non-operator's proposal; the
  operator-set dial auto-accepts a non-operator's proposal.

## 3. Validate + archive

- [x] 3.1 `openspec validate add-operator-authorization --strict`; typecheck/lint/both test layers
  green; update any op-count/parity assertions if touched. (No op count changed — gating is in-place.)
- [x] 3.2 Archive into `openspec/specs/` (`operator-authorization` created); fill the spec `Purpose`.
