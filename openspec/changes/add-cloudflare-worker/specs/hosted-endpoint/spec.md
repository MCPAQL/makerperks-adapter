## ADDED Requirements

### Requirement: Public HTTPS Streamable HTTP endpoint on Cloudflare

The adapter SHALL be deployable as a Cloudflare Worker that serves the same MCP semantic
READ surface (the `mcp_aql_read` tool) over a **public HTTPS Streamable HTTP** endpoint,
reusing the transport-agnostic request core. The endpoint SHALL be reachable at
`makerperks.mcpaql.com`. TLS SHALL be terminated by Cloudflare; the Worker code itself
SHALL NOT implement TLS.

#### Scenario: Connect over public HTTPS

- **WHEN** an MCP client connects to `https://makerperks.mcpaql.com`
- **THEN** it can list tools (a single `mcp_aql_read`) and call it — `introspect` plus the
  READ operations — receiving the standard discriminated results

#### Scenario: Parity with the local transports

- **WHEN** the same operation and parameters are issued against the hosted Worker and a
  local transport (stdio or Node Streamable HTTP)
- **THEN** the results are identical

#### Scenario: Stateless across clients

- **WHEN** multiple clients connect concurrently
- **THEN** the endpoint serves them without per-session server state (the surface is
  read-only)

### Requirement: Edge-safe operation

The hosted Worker SHALL operate using Web/Fetch APIs only and SHALL NOT depend on Node-only
runtime features (no filesystem, no `node:http` server). Program data SHALL be loaded via
`fetch`.

#### Scenario: Runs on the Workers runtime

- **WHEN** the Worker is built and deployed
- **THEN** it runs on the Cloudflare Workers runtime with no filesystem or Node HTTP-server
  dependency, loading `perks.json` over `fetch`
