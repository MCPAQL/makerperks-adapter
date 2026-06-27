# endpoint-auth Specification

## Purpose
TBD - created by archiving change add-endpoint-oauth. Update Purpose after archive.
## Requirements
### Requirement: OAuth 2.1 authorization with dynamic client registration

The hosted endpoint SHALL front the MCP surface with an OAuth 2.1 authorization server that
supports **dynamic client registration (DCR)**, serving the standard discovery metadata
(`/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`), a
token endpoint, and a registration endpoint, so OAuth-mandatory MCP clients can register and
obtain a token without manual configuration. The `mcp_aql_read` surface SHALL remain unchanged
behind it.

#### Scenario: Discovery metadata is served

- **WHEN** a client GETs `/.well-known/oauth-authorization-server` or
  `/.well-known/oauth-protected-resource`
- **THEN** it receives valid OAuth metadata (HTTP 200), not the previous 404/406

#### Scenario: Dynamic client registration

- **WHEN** a client POSTs a registration request to the registration endpoint
- **THEN** it is registered and receives client credentials, with no manual pre-registration

#### Scenario: Token issuance and authenticated MCP access

- **WHEN** a client completes the authorization flow and exchanges the code at the token
  endpoint
- **THEN** it receives an access token, and calling the MCP endpoint with that token returns the
  normal `mcp_aql_read` results (introspect + READ ops)

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

