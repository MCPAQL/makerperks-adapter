# hosted-endpoint Specification

## Purpose
TBD - created by archiving change add-cloudflare-worker. Update Purpose after archive.
## Requirements
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

### Requirement: Isolated stateful deployment (live endpoint untouched)

The stateful build SHALL be deployable to a **separate endpoint** from the live Stage 0
endpoint, using a distinct Worker name, a distinct hostname, a distinct OAuth grant store
(KV namespace), and the Durable Object binding it requires. Deploying the stateful build
SHALL NOT modify, replace, or otherwise affect `https://makerperks.mcpaql.com` or its
Stage 0 build. Cutover of the live endpoint to the stateful build is a separate, deliberate
step and is NOT performed by this deployment.

#### Scenario: Stateful build deploys without touching the live endpoint

- **WHEN** the stateful build is deployed
- **THEN** it serves on a separate test hostname with its own Worker, KV namespace, and
  Durable Object bindings, and `https://makerperks.mcpaql.com` continues to serve the
  unchanged Stage 0 anonymous read surface

#### Scenario: Live endpoint verified unchanged after a stateful deploy

- **WHEN** the live endpoint is checked after a stateful deploy
- **THEN** `https://makerperks.mcpaql.com` returns the same `mcp_aql_read` READ results as
  before (HTTP 200, parity preserved), confirming it was not overwritten

