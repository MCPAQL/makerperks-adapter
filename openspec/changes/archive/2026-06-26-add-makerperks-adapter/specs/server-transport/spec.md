## ADDED Requirements

### Requirement: Dual client transport over a shared core

The adapter SHALL run over both the **stdio** transport and the **Streamable HTTP**
transport, selected at launch, with both available from the first release. Both
transports SHALL drive the same request core, such that an operation produces
identical results and the same discriminated `{ success, data | error }` wire format
regardless of transport. The request core SHALL NOT depend on any transport-specific
API.

#### Scenario: Launches over stdio

- **WHEN** the server is launched in stdio mode (the default)
- **THEN** it serves MCP-AQL operations over standard input/output and is usable as a
  local MCP server added to a client's configuration

#### Scenario: Launches over Streamable HTTP

- **WHEN** the server is launched in HTTP mode
- **THEN** it exposes a single MCP **Streamable HTTP** endpoint that accepts POSTed
  requests, MAY upgrade a response to an SSE stream, and is connectable by an MCP
  client over a URL

#### Scenario: Transport parity

- **WHEN** the same operation with the same parameters is issued over stdio and over
  Streamable HTTP
- **THEN** the returned result and wire format are identical, differing only in
  transport framing

### Requirement: Streamable HTTP session and origin handling

When running over Streamable HTTP, the adapter SHALL manage sessions via the
`Mcp-Session-Id` header and SHALL validate the request `Origin` to reject
cross-origin requests from untrusted origins. The deprecated HTTP+SSE dual-endpoint
transport SHALL NOT be used.

#### Scenario: Session is established and reused

- **WHEN** a client completes the MCP initialization over Streamable HTTP
- **THEN** the server assigns a session identifier returned via `Mcp-Session-Id`, and
  subsequent requests carrying that identifier are bound to the same session

#### Scenario: Session ends

- **WHEN** a Streamable HTTP session is terminated or the connection is closed
- **THEN** all session-scoped state for that session is released

#### Scenario: Untrusted origin rejected

- **WHEN** a Streamable HTTP request arrives with an `Origin` not on the allowed list
- **THEN** the request is rejected rather than served
