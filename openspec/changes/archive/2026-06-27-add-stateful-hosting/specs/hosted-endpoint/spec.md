## ADDED Requirements

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
