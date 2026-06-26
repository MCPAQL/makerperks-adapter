# Design — Add Cloudflare Worker (public HTTPS endpoint)

## Context

The adapter's request core is transport-agnostic (Stage 0), so hosting is "add a third
transport binding," not a rewrite. Cloudflare is the natural host: the MCPAQL org already
deploys Workers and owns the `mcpaql.com` zone (e.g. `studio.mcpaql.com`). The MCP spec's
remote transport is **Streamable HTTP**, which Cloudflare supports first-class. The Stage 0
surface is read-only and stateless.

## Goals / Non-Goals

**Goals:** a public HTTPS Streamable HTTP endpoint at `makerperks.mcpaql.com` exposing the
same `mcp_aql_read` tool; reuse the core unchanged; keep the local Node transports working;
make the data source edge-safe.

**Non-Goals:** endpoint auth (Stage 1), per-session/stateful operations (Stage 1 via
`McpAgent`), rate limiting, an SSE fallback, and any change to the semantic surface.

## Decision 1 — MCP SDK web-standard transport (stateless) now; `McpAgent` later

Serve the Worker with the MCP SDK's `WebStandardStreamableHTTPServerTransport` in
**stateless mode** (`sessionIdGenerator: undefined`), reusing the existing
`createMcpServer(router)`. One server+transport is built per isolate and reused across
requests. The READ surface needs no per-session state, so this requires **no Durable
Objects and no extra dependency** — it reuses `@modelcontextprotocol/sdk`, which already
ships a Fetch-API (`Request`→`Response`) transport. When Stage 1 adds EXECUTE +
confirmation tokens + the Execution Safety Loop (genuinely per-session), migrate to
Cloudflare's `McpAgent` (a Durable Object per session).

_Alternatives:_ Cloudflare `agents` `createMcpHandler` (works, but adds a dependency to do
what the SDK transport already does for our stateless case); `McpAgent` now (rejected —
Durable Objects for a read-only service is overkill).

## Decision 2 — The Worker is a third binding over the same core

`src/worker.ts` builds the same `Router` (via the existing `buildApp`) and registers the
one `mcp_aql_read` tool, dispatching to `router.dispatch`. No core or operation code
changes. This keeps parity guaranteed by construction — all transports share one dispatch
path.

## Decision 3 — Edge-safe data loading (fetch + lazy fs)

On Workers there is no filesystem and no `node:http`. The data source already defaults to
`fetch`-ing the live `perks.json`, which works on Workers. We make the `node:fs/promises`
import **lazy** (imported only inside the local-file branch) so it is never bundled for URL
sources. Data is fetched on first use and cached with the existing TTL (a module-global
cache across requests in the same isolate is sufficient for a read-only service).

_Alternatives:_ Cloudflare KV / Cache API for the dataset (reasonable later for cross-isolate
sharing; unnecessary for v1 at ~135 KB and a short TTL).

## Decision 4 — `makerperks.mcpaql.com`, HTTPS at the edge

Deploy with a `wrangler` route binding `makerperks.mcpaql.com` on the `mcpaql.com` zone
(mirroring `studio.mcpaql.com`). Cloudflare terminates TLS and issues the certificate; the
Worker code speaks no TLS. `workers.dev` stays enabled for a pre-DNS smoke URL.

## Decision 5 — No endpoint auth in this change

The endpoint is **public and read-only** — the dataset is public and there is nothing to
protect yet. Authentication (and any write/EXECUTE path) arrives with the Stage 1 pipeline,
which is also when `McpAgent` + per-session state land. Shipping the read endpoint
unauthenticated now is safe and matches the data's public nature.

## Risks / Trade-offs

- **Workers ≠ Node.** Any accidental Node-only dependency (fs, `node:http`) breaks the
  Worker build → keep the Worker path on Web/Fetch APIs; verify with a Worker build, not just
  a Node run.
- **Exact `agents` SDK API** (`createMcpHandler` signature, imports, `compatibility_date` /
  flags) must be confirmed against current Cloudflare docs at implementation — treat the API
  names here as indicative.
- **Cold-start data fetch** adds latency on a cold isolate → cache after first load; the TTL
  bounds staleness.
- **Deploy needs interactive auth** (`wrangler login`) and DNS — outward-facing, done by the
  user; all code/config can land first.

## Open Questions

- Cache strategy: module-global (simple) vs Cloudflare Cache API / KV (cross-isolate) — start
  module-global.
- `compatibility_date` and whether `nodejs_compat` is needed at all once the fs import is lazy
  (goal: not needed).
- Whether to also expose the `workers.dev` URL publicly or keep it dev-only.
