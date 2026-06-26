## ADDED Requirements

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

Authorization SHALL complete for an **anonymous** principal without a real login, because the
directory data is public. This layer SHALL exist for client compatibility and SHALL NOT be
relied on to gate access to specific users or scopes. Real per-user, scoped authorization is
deferred to the Stage 1 pipeline.

#### Scenario: Auto-approve without login

- **WHEN** a client begins the authorization step
- **THEN** it is completed for an anonymous principal and redirected back with an authorization
  code, without requiring a user login

#### Scenario: Access is not user-gated

- **WHEN** any client holds a validly issued token
- **THEN** it can read the public directory; this layer does not restrict the surface to
  particular users (gating arrives with Stage 1)
