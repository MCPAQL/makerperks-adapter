## Why

Split out of the #87 reconcile design pass (#90). As the directory becomes a hosted, multi-user
substrate (anyone proposes flows with their own credentials), it needs an explicit trust boundary:
**every user is untrusted and may only propose; only the host/operator may accept a proposal into
the canonical, served set.** Without this, any authenticated user can mutate what everyone is
served — and the reconcile/export work (#87) has no one to authorize it.

The steering decision (2026-06-29): the server is **passive infrastructure**. It never acts on
GitHub (or anywhere) on a user's behalf — no per-user PRs, no server-held write credentials, no
autonomous outbound writes (the "dozens of duplicate Anthropic PRs from fifty identities" failure
mode is designed out). The only outbound calls the server makes are **reads**. Mutations are always
initiated by an authenticated principal acting under their own authority. This proposal codifies
that invariant and adds the operator role the acceptance surface (and #87) gate on.

## What Changes

- **Codify the zero-trust mutation invariant:** the server SHALL NOT initiate a state-changing
  outbound call. Every mutation (propose, accept, and the operator-run export-to-PR in #87) is
  initiated by an authenticated principal under their own authority; the server's only outbound
  calls are reads (`perks.json`, `flows.json`, and — for operator option A — the permission read).
- **Operator identity, host picks A or B:**
  - **A) GitHub-native** (when `OPERATOR_REPO` is configured): operator = **admin on the governing
    repo**. Resolved **at the OAuth callback**, where the user's token is already in hand for the
    identity fetch — one extra read (`GET /repos/{owner}/{repo}` → `permissions.admin`) — and only
    the resulting **boolean** is carried into the session props. **No token is stored at rest.**
    Costs a broader OAuth scope (`public_repo`/`repo` or `read:org`) than the current `read:user`.
  - **B) Static allowlist** (when `OPERATOR_LOGINS` is configured): operator = `login ∈` the list.
    **Zero outbound calls**, keeps the minimal `read:user` scope; the host maintains the list.
  - **Local / stdio** (single user, no auth): the lone user is implicitly the operator.
  - **Neither configured on a hosted deployment:** **fail safe** — no operators, nothing can be
    accepted — rather than fail open.
- **Operator-only acceptance:** `accept_flow` and `set_acceptance_mode` (and #87's reconcile/export
  ops) SHALL require operator authority; a non-operator caller gets a clear authorization error.
  `propose_flow`, discovery, and all READ ops stay open to any authenticated user (attributed via
  `proposed_by`, #73). The acceptance **dial** becomes the operator's pre-authorization for
  auto-accepting low-danger — not a user capability.
- **Per-session resolution:** operator status is resolved once per session (one permission read for
  option A), not per call — consistent with the reduce-per-request-reads work (#45).

## Capabilities

### New Capabilities

- `operator-authorization`: a zero-trust trust boundary — untrusted users propose; a configured
  host/operator (GitHub-admin-on-a-governing-repo **or** a static login allowlist; local user
  implicit) is the only principal that may accept into the canonical served set — under the
  invariant that the server never initiates a state-changing outbound call.

## Impact

- **Affected specs:** `operator-authorization` (new). Constrains the `flow-acceptance` ops
  (`accept_flow`, `set_acceptance_mode`) — expressed here as an operator-gating requirement that
  references them, rather than duplicating their definitions.
- **Affected code:** an `isOperator(session)` resolver + `OperatorPolicy` (A/B/implicit/fail-safe)
  in a new `session/operator.ts`; resolve the operator boolean at the OAuth callback in
  `worker-stateful.ts` (reusing the token already fetched for identity) and carry it in `UserProps`;
  thread an `operator` flag through `AppOptions`/`buildRouter` into `registerFlowAcceptanceOperations`;
  gate `accept_flow` + `set_acceptance_mode`. `auth/github.ts` gains an optional repo-permission
  read for option A and a scope bump when `OPERATOR_REPO` is set. The read-only worker (no
  acceptance) and local/stdio (implicit operator) are unaffected behaviorally.
- **Non-goals / tracked follow-up:** the durable-canonical mirror + operator-run export-to-PR
  (**#87**); anti-griefing rate-limits/bans on the open propose surface (**#73**); any server-held
  GitHub **write** credential or server-initiated PR (**explicitly excluded by the invariant**).
