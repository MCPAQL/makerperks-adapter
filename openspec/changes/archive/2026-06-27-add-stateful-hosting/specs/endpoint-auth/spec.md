## ADDED Requirements

### Requirement: Real per-user authorization via an upstream IdP

The stateful hosted endpoint SHALL authorize each client against a **real per-user login**
delegated to an **upstream identity provider** (GitHub), rather than auto-approving an
anonymous principal. The authenticated identity SHALL be carried as `userId` plus
identity `props` into the per-session context, so the backend can key per-user state
(profile + credential vault) on a real identity. Dynamic client registration, the
discovery metadata, and the token endpoint SHALL be retained; unauthenticated MCP requests
SHALL receive `401` with `WWW-Authenticate` so clients discover the authorization server.
No user password SHALL be stored by the adapter — authentication is delegated to the IdP.

#### Scenario: Real login at the authorization endpoint

- **WHEN** a client begins the authorization step against the stateful endpoint
- **THEN** the user is sent to the upstream IdP to log in, and authorization completes only
  after a successful upstream login — not via anonymous auto-approve

#### Scenario: Authenticated identity reaches the session

- **WHEN** a client completes the flow and connects with the issued token
- **THEN** the session carries the user's identity (`userId` + `props`), available to gate
  per-user state

#### Scenario: Unauthenticated access is challenged

- **WHEN** a client calls the MCP endpoint without a valid token
- **THEN** it receives `401` with a `WWW-Authenticate` header pointing at the authorization
  server

## MODIFIED Requirements

### Requirement: Anonymous auto-approve authorization (compatibility, not gating)

Anonymous auto-approve authorization SHALL be the mode used by the **public read-only
deployment** (the live Stage 0 endpoint over the public directory): authorization completes
for an anonymous principal without a real login, for client compatibility, and SHALL NOT be
relied on to gate access. The **stateful endpoint** SHALL instead use real per-user
authorization (see "Real per-user authorization via an upstream IdP"). The two modes are
selected per deployment.

#### Scenario: Public read deployment auto-approves without login

- **WHEN** a client begins the authorization step against the public read-only deployment
- **THEN** it is completed for an anonymous principal and redirected back with an
  authorization code, without requiring a user login

#### Scenario: Stateful deployment does not auto-approve

- **WHEN** a client begins the authorization step against the stateful endpoint
- **THEN** anonymous auto-approve does NOT apply — a real per-user login is required
