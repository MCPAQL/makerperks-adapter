## Why

Stage 0 made the adapter *capable* of Streamable HTTP, but it only runs locally —
loopback, plain `http://`. The target audience (makers on AI platforms) needs a
**public, paste-a-URL HTTPS endpoint**; that is the lowest-friction way to connect a
remote MCP server. We host it on **Cloudflare Workers** (the MCPAQL org already runs on
Cloudflare and owns the `mcpaql.com` zone), reusing the transport-agnostic request core
as a third binding. TLS is terminated by Cloudflare — the principle stays *HTTP at the
process, HTTPS at the edge*.

Cloudflare offers two remote-MCP paths: **`createMcpHandler()`** (stateless) and
**`McpAgent`** (a Durable Object per session, stateful). Our Stage 0 surface is
**read-only and stateless**, so `createMcpHandler()` is the right fit now;
`McpAgent`/Durable Objects are exactly what the **Stage 1** pipeline will want later
(per-session confirmation tokens + the Execution Safety Loop). We start stateless and
graduate when the pipeline needs state.

## What Changes

- **A Cloudflare Worker entry** (`src/worker.ts`) that serves the same `mcp_aql_read`
  semantic READ surface over **public HTTPS Streamable HTTP**, via the Cloudflare
  `agents` SDK `createMcpHandler`, dispatching to the existing `Router`. The local
  Node-`http` transport is unchanged.
- **Edge-safe data loading:** load `perks.json` via `fetch` (no filesystem) and cache
  with the existing TTL; make the `node:fs` import **lazy** so it is never pulled into
  the Worker bundle.
- **Deploy config + deployment:** `wrangler` configuration and a deploy to
  **`makerperks.mcpaql.com`** (HTTPS via Cloudflare, DNS route on the `mcpaql.com` zone).

## Capabilities

### New Capabilities

- `hosted-endpoint`: a public HTTPS Streamable HTTP MCP endpoint on Cloudflare Workers,
  reusing the core, reachable at `makerperks.mcpaql.com`.

### Modified Capabilities

- `data-source`: add **filesystem-free (fetch-based) loading** so the core runs on edge
  runtimes.

## Impact

- **Affected specs:** `hosted-endpoint` (new), `data-source` (added requirement).
- **Affected code:** new `src/worker.ts` (`createMcpHandler` over the `Router`); refactor
  `src/data/source.ts` so the `node:fs/promises` import is lazy (URL sources need no fs);
  `wrangler.jsonc`.
- **Dependencies:** the Cloudflare `agents` SDK; `@cloudflare/workers-types` and
  `wrangler` (dev). Exact `agents` API surface confirmed at implementation time.
- **Deployment prerequisites (manual / outward-facing):** an authenticated `wrangler`
  session on the Cloudflare account that owns `mcpaql.com` (interactive
  `wrangler login`); a DNS route for `makerperks.mcpaql.com`.
- **Non-goals / tracked follow-up:** **endpoint authentication** (public read-only for
  now; auth lands with the Stage 1 pipeline via `McpAgent`), **per-session/stateful
  operations**, and rate limiting.
