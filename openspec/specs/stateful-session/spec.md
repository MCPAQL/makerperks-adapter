# stateful-session Specification

## Purpose
TBD - created by archiving change add-stateful-hosting. Update Purpose after archive.
## Requirements
### Requirement: Per-session state via a Durable Object (McpAgent)

The stateful hosted endpoint SHALL back each MCP session with an isolated, session-scoped
state context, implemented on Cloudflare as a **Durable Object per session** via
`McpAgent`. The session context SHALL be the home for Stage-1 per-session state
(confirmation tokens, EXECUTE context) and SHALL be isolated across sessions and users.
The existing `mcp_aql_read` READ surface SHALL be served unchanged through this
session-backed path, with identical results to the stateless endpoint.

#### Scenario: Each session gets an isolated state context

- **WHEN** two MCP clients open separate sessions against the stateful endpoint
- **THEN** each session is backed by its own Durable Object instance, and state in one
  session is not visible to the other

#### Scenario: READ surface preserved through the session-backed path

- **WHEN** a client calls `mcp_aql_read` (introspect or a READ operation) against the
  stateful endpoint
- **THEN** it receives the same operations and the same discriminated results as the
  stateless endpoint — the session substrate does not change the READ surface

### Requirement: Session state substrate established without the pipeline

The per-session state container SHALL exist as a typed home for confirmation tokens and
execution context, but the READ surface SHALL NOT read or write it in this change. This
establishes the stateless → stateful substrate independently of the Stage-1 application
pipeline.

#### Scenario: Substrate present but unused by READ

- **WHEN** the stateful endpoint serves READ operations
- **THEN** the per-session state container is available on the session but is neither read
  nor written by READ — it is populated by the application pipeline in a later change

