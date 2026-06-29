## ADDED Requirements

### Requirement: The server never initiates a state-changing outbound call

The adapter SHALL NOT initiate any state-changing outbound call (no writes to GitHub or any external
service) on its own or on a user's behalf. Every mutation SHALL be initiated by an authenticated
principal acting under their own authority. The server's only outbound calls SHALL be reads — the
`perks.json` and `flows.json` fetches, and the operator permission read (option A). The server SHALL
hold no GitHub write credential.

#### Scenario: No server-initiated writes

- **WHEN** the adapter runs (locally or hosted) and processes proposals, acceptances, or exports
- **THEN** it makes no outbound state-changing call — propose/accept mutate only the adapter's own
  durable state, and any upstream publication (a PR) is performed by the operator with their own
  tooling, not by the server

#### Scenario: Outbound calls are reads only

- **WHEN** the adapter makes an outbound network call
- **THEN** it is a read (`perks.json`, `flows.json`, or the operator permission read), never a write

### Requirement: Operator identity is host-configured (GitHub-native or allowlist)

The adapter SHALL determine whether the authenticated principal of a session is an **operator**
through a host-configured policy: **A** — when a governing repo is configured (`OPERATOR_REPO`),
operator status SHALL be the principal's **admin permission on that repo**, read with the
principal's **own** OAuth token (`GET /repos/{owner}/{repo}` → `permissions.admin`) and persisted as
a boolean only (no token stored); **B** — when an allowlist is configured (`OPERATOR_LOGINS`),
operator status SHALL be membership of the principal's login in that list, with no outbound call.
When both are configured, either SHALL grant operator status. On a single-user local/stdio
deployment the lone user SHALL be the operator implicitly. When a hosted deployment configures
neither, the adapter SHALL fail safe — no principal is an operator.

#### Scenario: GitHub-native operator (A)

- **WHEN** `OPERATOR_REPO` is configured and the session principal has admin on that repo
- **THEN** the session is an operator; a principal without admin on that repo is not

#### Scenario: Allowlist operator (B)

- **WHEN** `OPERATOR_LOGINS` is configured and the principal's login is in the list
- **THEN** the session is an operator; a login not in the list is not, and no outbound call is made

#### Scenario: Local deployment operator is implicit

- **WHEN** the adapter runs as a single-user local/stdio tool
- **THEN** the lone user is an operator (it is their own machine)

#### Scenario: Hosted deployment with no operator config fails safe

- **WHEN** a hosted deployment configures neither `OPERATOR_REPO` nor `OPERATOR_LOGINS`
- **THEN** no session is an operator, so nothing can be accepted (fail safe, not fail open)

### Requirement: Operator status is resolved per session and stores no credential

The adapter SHALL resolve operator status **once per session**, not per operation. Under option A it
SHALL be resolved at the OAuth callback — reusing the token already fetched for the identity — so
the resolved **boolean** is carried into the session and no access token is stored at rest, and no
per-request permission read occurs. The broader OAuth scope required to read repo permissions SHALL
be requested only when a governing-repo policy is active; an allowlist-only or local deployment
SHALL keep the minimal scope.

#### Scenario: Only a boolean is persisted

- **WHEN** option A resolves operator status at the callback
- **THEN** the user's access token is not stored; only the operator boolean enters the session

#### Scenario: Minimal scope unless option A is active

- **WHEN** the host configures only an allowlist (or runs locally)
- **THEN** the OAuth authorize request keeps the minimal identity scope (no repo/org scope is asked)

### Requirement: Untrusted users propose; only operators accept

The adapter SHALL treat every authenticated user as untrusted: `propose_flow`, the discovery
operations, and all READ operations SHALL remain available to any authenticated user (proposals
attributed via `proposed_by`). Accepting a proposal into the served set SHALL require operator
authority: `accept_flow` and `set_acceptance_mode` SHALL return a `FORBIDDEN` error when the session
is not an operator, and SHALL NOT mutate the served set or the acceptance mode. The acceptance
autonomy dial SHALL therefore be an operator-only pre-authorization, not a user capability.

#### Scenario: A non-operator may propose but not accept

- **WHEN** a non-operator session calls `propose_flow`
- **THEN** the proposal is queued (attributed to that user); **and WHEN** the same session calls
  `accept_flow` or `set_acceptance_mode`, it is refused with `FORBIDDEN` and nothing is changed

#### Scenario: An operator may accept

- **WHEN** an operator session calls `accept_flow` on a ready proposal
- **THEN** the proposal is accepted and served (the existing acceptance behavior applies)

#### Scenario: Reads and proposals are never operator-gated

- **WHEN** any authenticated user calls a READ, a discovery op, or `propose_flow`
- **THEN** operator status is not required and the call proceeds
